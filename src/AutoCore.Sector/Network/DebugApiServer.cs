namespace AutoCore.Sector.Network;

using AutoCore.Game.Managers;
using AutoCore.Utils;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Threading;

/// <summary>
/// Loopback-only HTTP admin API used by AutoCore.DebugTool to drive and inspect the server during
/// inventory reverse-engineering. It exposes a tiny surface:
/// <list type="bullet">
/// <item><c>POST /debug/additem?cbid={cbid}</c> — give the item to the first logged-in character.</item>
/// <item><c>GET  /debug/inventory</c> — the server-side cargo list for all logged-in characters.</item>
/// <item><c>GET  /debug/items?page={n}</c> — paged list of inventory-capable clonebases.</item>
/// </list>
/// State-touching work is marshalled onto the game loop via <see cref="SectorServer.EnqueueOnMainLoop"/>.
/// This is a debug-only facility; it binds to 127.0.0.1 and performs no authentication.
/// </summary>
public sealed class DebugApiServer
{
    private const int ItemsPageSize = 20;
    private const int ActionTimeoutMs = 5000;

    private readonly HttpListener _listener = new();
    private readonly SectorServer _server;
    private readonly int _port;
    private Thread _thread;
    private volatile bool _running;

    public DebugApiServer(SectorServer server, int port)
    {
        _server = server;
        _port = port;
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
    }

    public void Start()
    {
        if (_port <= 0)
            return;

        _running = true;
        _listener.Start();

        _thread = new Thread(Loop) { IsBackground = true, Name = "DebugApiServer" };
        _thread.Start();

        Logger.WriteLog(LogType.Initialize, "Debug admin API listening on http://127.0.0.1:{0}/", _port);
    }

    public void Stop()
    {
        _running = false;

        try
        {
            _listener.Stop();
        }
        catch
        {
            // Listener already disposed; nothing to do.
        }
    }

    private void Loop()
    {
        while (_running)
        {
            HttpListenerContext context;
            try
            {
                context = _listener.GetContext();
            }
            catch
            {
                break; // Listener stopped.
            }

            try
            {
                Handle(context);
            }
            catch (Exception ex)
            {
                Logger.WriteLog(LogType.Error, "Debug API request failed: {0}", ex);
                WriteJson(context, 500, new { error = ex.Message });
            }
        }
    }

    private void Handle(HttpListenerContext context)
    {
        var path = context.Request.Url?.AbsolutePath?.TrimEnd('/').ToLowerInvariant() ?? "";
        var method = context.Request.HttpMethod;

        switch (path)
        {
            case "/debug/additem" when method == "POST":
                HandleAddItem(context);
                break;

            case "/debug/inventory" when method == "GET":
                HandleInventory(context);
                break;

            case "/debug/items" when method == "GET":
                HandleItems(context);
                break;

            default:
                WriteJson(context, 404, new { error = "unknown endpoint", path });
                break;
        }
    }

    private void HandleAddItem(HttpListenerContext context)
    {
        var cbidRaw = context.Request.QueryString["cbid"];
        if (!int.TryParse(cbidRaw, out var cbid))
        {
            WriteJson(context, 400, new { error = "missing or invalid 'cbid' query parameter" });
            return;
        }

        var ok = false;
        string error = null;
        long? coid = null;
        string characterName = null;

        var done = new ManualResetEventSlim(false);
        _server.EnqueueOnMainLoop(() =>
        {
            try
            {
                var character = ObjectManager.Instance.GetAllCharacters().FirstOrDefault();
                if (character == null)
                {
                    error = "No logged-in character to receive the item.";
                    return;
                }

                characterName = character.Name;

                var before = character.GetCargoSnapshot().Count;
                ok = ChatManager.Instance.TryGiveItemByCbid(character.OwningConnection, character, cbid, out error);

                if (ok)
                {
                    var snapshot = character.GetCargoSnapshot();
                    if (snapshot.Count > before)
                        coid = snapshot[^1].Coid;
                }
            }
            finally
            {
                done.Set();
            }
        });

        if (!done.Wait(ActionTimeoutMs))
        {
            WriteJson(context, 504, new { error = "timed out waiting for game loop" });
            return;
        }

        if (!ok)
        {
            WriteJson(context, 400, new { error });
            return;
        }

        WriteJson(context, 200, new { success = true, cbid, coid, character = characterName });
    }

    private void HandleInventory(HttpListenerContext context)
    {
        object payload = null;

        var done = new ManualResetEventSlim(false);
        _server.EnqueueOnMainLoop(() =>
        {
            try
            {
                payload = new
                {
                    characters = ObjectManager.Instance.GetAllCharacters().Select(c => new
                    {
                        name = c.Name,
                        coid = c.ObjectId.Coid,
                        items = c.GetCargoSnapshot().Select(e => new
                        {
                            coid = e.Coid,
                            x = e.PositionX,
                            y = e.PositionY
                        })
                    })
                };
            }
            finally
            {
                done.Set();
            }
        });

        if (!done.Wait(ActionTimeoutMs))
        {
            WriteJson(context, 504, new { error = "timed out waiting for game loop" });
            return;
        }

        WriteJson(context, 200, payload);
    }

    private void HandleItems(HttpListenerContext context)
    {
        var page = 1;
        if (int.TryParse(context.Request.QueryString["page"], out var requested) && requested > 0)
            page = requested;

        var items = AssetManager.Instance.GetItemCloneBases();
        var totalPages = Math.Max(1, (items.Count + ItemsPageSize - 1) / ItemsPageSize);
        if (page > totalPages)
            page = totalPages;

        var start = (page - 1) * ItemsPageSize;
        var end = Math.Min(start + ItemsPageSize, items.Count);

        var pageItems = new List<object>();
        for (var i = start; i < end; ++i)
        {
            var item = items[i];
            pageItems.Add(new
            {
                cbid = item.Cbid,
                name = item.Name,
                type = item.Type.ToString(),
                sizeX = item.InvSizeX,
                sizeY = item.InvSizeY
            });
        }

        WriteJson(context, 200, new { page, totalPages, total = items.Count, items = pageItems });
    }

    private static void WriteJson(HttpListenerContext context, int statusCode, object payload)
    {
        try
        {
            var json = JsonSerializer.Serialize(payload);
            var buffer = Encoding.UTF8.GetBytes(json);

            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json";
            context.Response.ContentLength64 = buffer.Length;
            context.Response.OutputStream.Write(buffer, 0, buffer.Length);
            context.Response.OutputStream.Close();
        }
        catch
        {
            // Client likely disconnected; nothing useful to do.
        }
    }
}
