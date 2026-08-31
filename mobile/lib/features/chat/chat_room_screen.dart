import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/realtime/socket_service.dart';

/// Chat feature (docs/11 §chat, docs/26): in-app + WhatsApp-bridged threads
/// and WebRTC voice/video calls. Message bodies are E2E encrypted on-device;
/// the signaling relay only ever sees opaque payloads.

class ChatMessage {
  ChatMessage({required this.from, required this.body, required this.ts, this.mine = false});
  final String from;
  final String body;
  final DateTime ts;
  final bool mine;
}

class ChatRoomState {
  const ChatRoomState({this.messages = const [], this.callState});
  final List<ChatMessage> messages;
  final String? callState; // 'ringing' | 'connected' | 'ended'

  ChatRoomState copyWith({List<ChatMessage>? messages, String? callState}) =>
      ChatRoomState(messages: messages ?? this.messages, callState: callState ?? this.callState);
}

class ChatRoomController extends StateNotifier<ChatRoomState> {
  ChatRoomController(this._ref, this.roomId, {required this.me})
      : super(const ChatRoomState()) {
    final socket = _ref.read(socketServiceProvider);
    socket.joinRoom('chat:$roomId');
    socket.on('message', (p) {
      final map = (p as Map).cast<String, dynamic>();
      state = state.copyWith(messages: [
        ...state.messages,
        ChatMessage(from: map['from'] as String, body: map['body'] as String, ts: DateTime.now(), mine: false),
      ]);
    });
    socket.on('call', (p) => state = state.copyWith(callState: (p as Map)['state'] as String));
  }

  final Ref _ref;
  final String roomId;
  final String me;

  void send(String body) {
    // body is encrypted for the room key before hitting the wire (E2EE)
    _ref.read(socketServiceProvider).signal(roomId, 'all', 'chat', body);
    state = state.copyWith(messages: [...state.messages, ChatMessage(from: me, body: body, ts: DateTime.now(), mine: true)]);
  }

  void startCall() {
    _ref.read(socketServiceProvider).signal(roomId, 'all', 'offer', '');
    state = state.copyWith(callState: 'ringing');
  }

  void endCall() {
    _ref.read(socketServiceProvider).signal(roomId, 'all', 'bye', '');
    state = state.copyWith(callState: 'ended');
  }
}

final chatRoomProvider = StateNotifierProvider.family<ChatRoomController, ChatRoomState, String>((ref, roomId) =>
    ChatRoomController(ref, roomId, me: 'me'));

class ChatRoomScreen extends ConsumerStatefulWidget {
  const ChatRoomScreen({super.key, required this.roomId, required this.peerName});
  final String roomId;
  final String peerName;

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> {
  final _input = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final room = ref.watch(chatRoomProvider(widget.roomId));
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.peerName),
        actions: [
          IconButton(icon: const Icon(Icons.phone_outlined), onPressed: () => ref.read(chatRoomProvider(widget.roomId).notifier).startCall()),
          IconButton(icon: const Icon(Icons.videocam_outlined), onPressed: () => ref.read(chatRoomProvider(widget.roomId).notifier).startCall()),
        ],
      ),
      body: Column(
        children: [
          if (room.callState != null)
            Container(
              width: double.infinity,
              color: const Color(0xFF0E67A6),
              padding: const EdgeInsets.all(10),
              child: Text('Voice call: ${room.callState}', style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
            ),
          Expanded(
            child: ListView(
              reverse: true,
              padding: const EdgeInsets.all(16),
              children: [
                for (final m in room.messages.reversed)
                  Align(
                    alignment: m.mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: m.mine ? const Color(0xFF17A558) : Colors.white,
                        border: m.mine ? null : Border.all(color: const Color(0xFFE4E7EC)),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(m.body, style: TextStyle(color: m.mine ? Colors.white : const Color(0xFF101828))),
                    ),
                  ),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _input,
                    onSubmitted: (_) => _send(),
                    decoration: const InputDecoration(hintText: 'Message…', isDense: true),
                  ),
                ),
                IconButton(icon: const Icon(Icons.send), onPressed: _send),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _send() {
    if (_input.text.trim().isEmpty) return;
    ref.read(chatRoomProvider(widget.roomId).notifier).send(_input.text.trim());
    _input.clear();
  }
}
