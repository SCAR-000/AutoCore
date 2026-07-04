namespace AutoCore.DebugTool.Memory;

using System.Diagnostics;
using System.Runtime.InteropServices;

/// <summary>
/// Thin wrapper over a running autoassault.exe process: opens a read handle, locates the main module
/// base address, and reads typed values out of the process address space via ReadProcessMemory.
/// </summary>
public sealed class GameProcess : IDisposable
{
    private const int PROCESS_VM_READ = 0x0010;
    private const int PROCESS_VM_WRITE = 0x0020;
    private const int PROCESS_VM_OPERATION = 0x0008;
    private const int PROCESS_CREATE_THREAD = 0x0002;
    private const int PROCESS_QUERY_INFORMATION = 0x0400;
    private const uint LIST_MODULES_ALL = 0x03;

    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RESERVE = 0x2000;
    private const uint MEM_RELEASE = 0x8000;
    private const uint PAGE_EXECUTE_READWRITE = 0x40;
    private const uint WAIT_TIMEOUT = 0x102;

    // Access rights for both reading and injecting (calling a function via a remote thread).
    private const int PROCESS_ALL_NEEDED =
        PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(int access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(IntPtr handle, IntPtr baseAddress, byte[] buffer, int size, out int bytesRead);

    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumProcessModulesEx(IntPtr handle, [Out] IntPtr[] modules, int sizeBytes, out int needed, uint filterFlag);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAllocEx(IntPtr handle, IntPtr address, uint size, uint allocationType, uint protect);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool VirtualFreeEx(IntPtr handle, IntPtr address, uint size, uint freeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WriteProcessMemory(IntPtr handle, IntPtr baseAddress, byte[] buffer, int size, out int written);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateRemoteThread(IntPtr handle, IntPtr threadAttributes, uint stackSize, IntPtr startAddress, IntPtr parameter, uint creationFlags, out uint threadId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeThread(IntPtr handle, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int VirtualQueryEx(IntPtr handle, IntPtr address, out MEMORY_BASIC_INFORMATION buffer, int length);

    // 64-bit layout (this tool runs as x64 while the game is x86; WOW64 lets us query the target).
    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORY_BASIC_INFORMATION
    {
        public IntPtr BaseAddress;
        public IntPtr AllocationBase;
        public uint AllocationProtect;
        public uint __alignment1;
        public ulong RegionSize;
        public uint State;
        public uint Protect;
        public uint Type;
        public uint __alignment2;
    }

    private const uint MEM_COMMIT_STATE = 0x1000;
    private const uint PAGE_GUARD = 0x100;
    private const uint PAGE_NOACCESS = 0x01;

    /// <summary>
    /// Scans the target's committed, readable memory for every occurrence of an 8-byte value (e.g. a
    /// coid). Returns the absolute addresses where it appears. Used to locate where an item the server
    /// just added actually landed in the client (object table, cargo grid, or nowhere).
    /// </summary>
    public IReadOnlyList<IntPtr> ScanForInt64(long value)
    {
        var needle = BitConverter.GetBytes(value);
        var hits = new List<IntPtr>();

        // 32-bit target: user address space is below 0x8000_0000.
        var address = (long)0x10000;
        const long maxAddress = 0x7FFF0000;

        while (address < maxAddress)
        {
            if (VirtualQueryEx(_handle, (IntPtr)address, out var info, Marshal.SizeOf<MEMORY_BASIC_INFORMATION>()) == 0)
                break;

            var regionBase = info.BaseAddress.ToInt64();
            var regionSize = (long)info.RegionSize;
            if (regionSize <= 0)
            {
                address += 0x1000;
                continue;
            }

            var readable = info.State == MEM_COMMIT_STATE
                           && (info.Protect & PAGE_GUARD) == 0
                           && (info.Protect & PAGE_NOACCESS) == 0;

            if (readable && TryReadBytes((IntPtr)regionBase, (int)Math.Min(regionSize, int.MaxValue), out var buffer))
                FindAll(buffer, needle, regionBase, hits);

            address = regionBase + regionSize;
        }

        return hits;
    }

    private static void FindAll(byte[] haystack, byte[] needle, long regionBase, List<IntPtr> hits)
    {
        for (var i = 0; i <= haystack.Length - needle.Length; ++i)
        {
            var match = true;
            for (var j = 0; j < needle.Length; ++j)
            {
                if (haystack[i + j] != needle[j])
                {
                    match = false;
                    break;
                }
            }

            if (match)
                hits.Add((IntPtr)(regionBase + i));
        }
    }

    private readonly IntPtr _handle;

    public int ProcessId { get; }
    public IntPtr ModuleBase { get; }
    public string ProcessName { get; }

    private GameProcess(IntPtr handle, int processId, IntPtr moduleBase, string processName)
    {
        _handle = handle;
        ProcessId = processId;
        ModuleBase = moduleBase;
        ProcessName = processName;
    }

    /// <summary>
    /// Opens the game by process name (default "autoassault"), or by an explicit PID when provided.
    /// Returns null with a reason in <paramref name="error"/> if the process cannot be opened.
    /// </summary>
    public static GameProcess? Open(string processName, int? pid, out string? error)
    {
        error = null;

        Process? process;
        try
        {
            if (pid is { } explicitPid)
            {
                process = Process.GetProcessById(explicitPid);
            }
            else
            {
                var matches = Process.GetProcessesByName(processName);
                if (matches.Length == 0)
                {
                    error = $"No running process named '{processName}'. Is the game launched?";
                    return null;
                }

                process = matches[0];
            }
        }
        catch (Exception ex)
        {
            error = $"Could not find the game process: {ex.Message}";
            return null;
        }

        var handle = OpenProcess(PROCESS_ALL_NEEDED, false, process.Id);
        if (handle == IntPtr.Zero)
        {
            error = $"OpenProcess failed (Win32 error {Marshal.GetLastWin32Error()}). Try running as administrator.";
            return null;
        }

        // The game is a 32-bit process; reading process.MainModule from a 64-bit host throws
        // "Access is denied", so resolve the exe base through psapi instead (the first module is the exe).
        var moduleBase = ResolveModuleBase(handle);
        if (moduleBase == IntPtr.Zero)
        {
            CloseHandle(handle);
            error = $"Could not resolve the game module base (Win32 error {Marshal.GetLastWin32Error()}). " +
                    "Try running this tool as administrator and matching the game's bitness.";
            return null;
        }

        return new GameProcess(handle, process.Id, moduleBase, process.ProcessName);
    }

    private static IntPtr ResolveModuleBase(IntPtr handle)
    {
        var modules = new IntPtr[1024];
        if (!EnumProcessModulesEx(handle, modules, modules.Length * IntPtr.Size, out var needed, LIST_MODULES_ALL))
            return IntPtr.Zero;

        var count = needed / IntPtr.Size;
        return count > 0 ? modules[0] : IntPtr.Zero; // First module is the process's own exe image.
    }

    /// <summary>Reads <paramref name="count"/> raw bytes at the given absolute address.</summary>
    public bool TryReadBytes(IntPtr address, int count, out byte[] buffer)
    {
        buffer = new byte[count];
        return ReadProcessMemory(_handle, address, buffer, count, out var read) && read == count;
    }

    public bool TryReadInt32(IntPtr address, out int value)
    {
        value = 0;
        if (!TryReadBytes(address, 4, out var buffer))
            return false;

        value = BitConverter.ToInt32(buffer, 0);
        return true;
    }

    public bool TryReadUInt32(IntPtr address, out uint value)
    {
        value = 0;
        if (!TryReadBytes(address, 4, out var buffer))
            return false;

        value = BitConverter.ToUInt32(buffer, 0);
        return true;
    }

    public bool TryReadInt64(IntPtr address, out long value)
    {
        value = 0;
        if (!TryReadBytes(address, 8, out var buffer))
            return false;

        value = BitConverter.ToInt64(buffer, 0);
        return true;
    }

    public bool TryReadByte(IntPtr address, out byte value)
    {
        value = 0;
        if (!TryReadBytes(address, 1, out var buffer))
            return false;

        value = buffer[0];
        return true;
    }

    /// <summary>
    /// Reads a 32-bit pointer at <paramref name="address"/> (the binary is x86, so pointers are 4 bytes).
    /// </summary>
    public bool TryReadPointer(IntPtr address, out IntPtr value)
    {
        value = IntPtr.Zero;
        if (!TryReadUInt32(address, out var raw))
            return false;

        value = (IntPtr)raw;
        return true;
    }

    /// <summary>Rebases a static RVA (relative to the 0x400000 image base) onto the live module.</summary>
    public IntPtr Rebase(int rva) => ModuleBase + rva;

    /// <summary>
    /// Calls a <c>__thiscall</c> function inside the target process by writing a tiny x86 stub and
    /// running it on a remote thread. The stub loads <paramref name="thisPtr"/> into ECX, pushes
    /// <paramref name="args"/> right-to-left, calls the function, and returns its EAX as the thread
    /// exit code. The callee is assumed to clean its own stack args (stdcall-style, e.g. <c>ret 0x8</c>).
    ///
    /// NOTE: this runs on an injected thread, not the game's main loop. It works for self-contained
    /// routines but can crash the game if the target touches main-thread-only state.
    /// </summary>
    public bool TryCallThiscall(IntPtr funcAddr, IntPtr thisPtr, int[] args, uint timeoutMs, out uint returnValue, out string? error)
    {
        returnValue = 0;
        error = null;

        var stub = BuildThiscallStub(funcAddr, thisPtr, args);

        var remote = VirtualAllocEx(_handle, IntPtr.Zero, (uint)stub.Length, MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
        if (remote == IntPtr.Zero)
        {
            error = $"VirtualAllocEx failed (Win32 error {Marshal.GetLastWin32Error()}).";
            return false;
        }

        try
        {
            if (!WriteProcessMemory(_handle, remote, stub, stub.Length, out var written) || written != stub.Length)
            {
                error = $"WriteProcessMemory failed (Win32 error {Marshal.GetLastWin32Error()}).";
                return false;
            }

            var thread = CreateRemoteThread(_handle, IntPtr.Zero, 0, remote, IntPtr.Zero, 0, out _);
            if (thread == IntPtr.Zero)
            {
                error = $"CreateRemoteThread failed (Win32 error {Marshal.GetLastWin32Error()}).";
                return false;
            }

            try
            {
                if (WaitForSingleObject(thread, timeoutMs) == WAIT_TIMEOUT)
                {
                    error = "Remote call timed out (the game thread may be blocked).";
                    return false;
                }

                GetExitCodeThread(thread, out returnValue);
                return true;
            }
            finally
            {
                CloseHandle(thread);
            }
        }
        finally
        {
            VirtualFreeEx(_handle, remote, 0, MEM_RELEASE);
        }
    }

    private static byte[] BuildThiscallStub(IntPtr funcAddr, IntPtr thisPtr, int[] args)
    {
        using var stream = new MemoryStream();

        // mov ecx, <thisPtr>
        stream.WriteByte(0xB9);
        stream.Write(BitConverter.GetBytes((uint)thisPtr.ToInt64()));

        // push <arg> for each argument, right-to-left (matches cdecl/stdcall arg order)
        for (var i = args.Length - 1; i >= 0; --i)
        {
            stream.WriteByte(0x68);
            stream.Write(BitConverter.GetBytes(args[i]));
        }

        // mov eax, <funcAddr> ; call eax
        stream.WriteByte(0xB8);
        stream.Write(BitConverter.GetBytes((uint)funcAddr.ToInt64()));
        stream.WriteByte(0xFF);
        stream.WriteByte(0xD0);

        // ret  (callee already cleaned its stack args)
        stream.WriteByte(0xC3);

        return stream.ToArray();
    }

    public void Dispose()
    {
        if (_handle != IntPtr.Zero)
            CloseHandle(_handle);
    }
}
