using System;
using System.Buffers;
using System.IO;
using System.Net;
using System.Net.Sockets;

namespace AutoCore.Auth.Network
{
    using Communicator;
    using Communicator.Packets;
    using Utils.Networking;
    using Utils.Packets;

    public class CommunicatorClient
    {
        public const int SendBufferSize = 512;

        public LengthedSocket Socket { get; }
        public AuthServer Server { get; }
        public byte ServerId { get; set; }
        public int Port { get; set; }
        public byte AgeLimit { get; set; }
        public byte PKFlag { get; set; }
        public ushort CurrentPlayers { get; set; }
        public ushort MaxPlayers { get; set; }
        public DateTime LastRequestTime { get; set; }
        public IPAddress PublicAddress { get; set; }

        private readonly PacketRouter<CommunicatorClient, CommunicatorOpcode> _router = new();

        public bool Connected => Socket.Connected;

        public CommunicatorClient(LengthedSocket socket, AuthServer server)
        {
            Server = server;
            Socket = socket;

            Socket.OnReceive += OnReceive;
            Socket.OnError += OnError;

            Socket.ReceiveAsync();
        }

        private void OnReceive(byte[] data, int length)
        {
            var br = new BinaryReader(new MemoryStream(data, 0, length, false));

            var packetType = _router.GetPacketType((CommunicatorOpcode)br.ReadByte());
            if (packetType == null)
                return;

            if (Activator.CreateInstance(packetType) is not IOpcodedPacket<CommunicatorOpcode> packet)
                return;

            packet.Read(br);

            _router.RoutePacket(this, packet);

            Socket.ReceiveAsync();
        }

        private void OnError(SocketAsyncEventArgs args)
        {
            Socket.Close();

            Server.DisconnectCommunicator(this);
        }

        private void SendPacket(IOpcodedPacket<CommunicatorOpcode> packet)
        {
            var buffer = ArrayPool<byte>.Shared.Rent(SendBufferSize);
            var writer = new BinaryWriter(new MemoryStream(buffer, true));

            packet.Write(writer);

            Socket.Send(buffer, 0, (int)writer.BaseStream.Position);

            ArrayPool<byte>.Shared.Return(buffer);
        }

        public void RequestServerInfo()
        {
            LastRequestTime = DateTime.Now;

            SendPacket(new ServerInfoRequestPacket());
        }

        public void RequestRedirection(AuthClient client)
        {
            SendPacket(new RedirectRequestPacket(new()
            {
                AccountId = client.Account.Id,
                Email = client.Account.Email,
                Username = client.Account.Username,
                OneTimeKey = client.OneTimeKey
            }));
        }

        [PacketHandler(CommunicatorOpcode.LoginRequest)]
#pragma warning disable IDE0051 // Remove unused private members
        private void MsgLoginRequest(LoginRequestPacket packet)
#pragma warning restore IDE0051 // Remove unused private members
        {
            if (!Server.AuthenticateGameServer(packet, this))
            {
                SendPacket(new LoginResponsePacket
                {
                    Result = CommunicatorActionResult.Failure
                });
                return;
            }

            SendPacket(new LoginResponsePacket
            {
                Result = CommunicatorActionResult.Success
            });

            ServerId = packet.Data.Id;
            PublicAddress = packet.Data.Address;

            RequestServerInfo();
        }

        [PacketHandler(CommunicatorOpcode.ServerInfoResponse)]
#pragma warning disable IDE0051 // Remove unused private members
        private void MsgGameInfoResponse(ServerInfoResponsePacket packet)
#pragma warning restore IDE0051 // Remove unused private members
        {
            Server.UpdateServerInfo(this, packet);
        }

        [PacketHandler(CommunicatorOpcode.RedirectResponse)]
#pragma warning disable IDE0051 // Remove unused private members
        private void MsgRedirectResponse(RedirectResponsePacket packet)
#pragma warning restore IDE0051 // Remove unused private members
        {
            Server.RedirectResponse(this, packet);
        }
    }
}
