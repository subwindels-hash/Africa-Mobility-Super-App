/**
 * Chat & Realtime Service (docs/08 chat-service).
 * WebRTC signaling rooms (join/offer/answer/ICE relay with E2EE opaque
 * payloads), WhatsApp Business transport binding, SMS gateway adapter with
 * delivery reports, and message retention/moderation.
 */
export type SignalKind = 'offer' | 'answer' | 'ice' | 'bye';
export interface SignalMessage { roomId: string; from: string; to: string; kind: SignalKind; encryptedPayload: string; ts: Date }
export interface ChatMessage { id: string; roomId: string; from: string; body: string; transport: 'in_app' | 'whatsapp' | 'sms'; ts: Date; flagged?: boolean }

export class SignalingServer {
  private rooms = new Map<string, { participants: Set<string>; signals: SignalMessage[]; moderators: string[]; whatsappBinding?: { phone: string; waRoomId: string } }>();
  private seq = 0;

  createRoom(moderators: string[] = []): string {
    const roomId = `room_${++this.seq}`;
    this.rooms.set(roomId, { participants: new Set(), signals: [], moderators });
    return roomId;
  }

  join(roomId: string, participant: string): { participants: string[] } {
    const room = this.room(roomId);
    if (room.moderators.length && room.participants.size >= 6 && !room.moderators.includes(participant)) {
      throw new Error('room full — max 6 participants');
    }
    room.participants.add(participant);
    return { participants: [...room.participants] };
  }

  /** Relay a signal — payloads are E2E encrypted blobs the server cannot read. */
  signal(msg: Omit<SignalMessage, 'ts'>): SignalMessage {
    const room = this.room(msg.roomId);
    if (!room.participants.has(msg.from)) throw new Error(`${msg.from} not in room`);
    if (!room.participants.has(msg.to)) throw new Error(`${msg.to} not in room`);
    if (msg.kind === 'bye') room.participants.delete(msg.from);
    const full: SignalMessage = { ...msg, ts: new Date() };
    room.signals.push(full);
    return full;
  }

  /** Offline participants replay missed signals (reconnect support). */
  signalsFor(roomId: string, participant: string, since?: Date): SignalMessage[] {
    return this.room(roomId).signals.filter((s) => s.to === participant && (!since || s.ts > since));
  }

  kick(roomId: string, moderator: string, participant: string): void {
    const room = this.room(roomId);
    if (!room.moderators.includes(moderator)) throw new Error('only moderators can kick');
    room.participants.delete(participant);
    room.signals.push({ roomId, from: moderator, to: participant, kind: 'bye', encryptedPayload: '', ts: new Date() });
  }

  /** Bind a WhatsApp thread into the room (hybrid support calls). */
  bindWhatsApp(roomId: string, phone: string): { waRoomId: string } {
    const room = this.room(roomId);
    const waRoomId = `wa_${roomId}_${phone.slice(-6)}`;
    room.whatsappBinding = { phone, waRoomId };
    return { waRoomId };
  }

  binding(roomId: string) { return this.room(roomId).whatsappBinding; }
  participants(roomId: string): string[] { return [...this.room(roomId).participants]; }
  private room(roomId: string) { const r = this.rooms.get(roomId); if (!r) throw new Error(`unknown room ${roomId}`); return r; }
}

// ── Message store with retention + moderation ───────────────────────────────

const BANNED = ['scam', 'fraud link', 'send your bvn'];

export class MessageStore {
  private messages: ChatMessage[] = [];
  private seq = 0;

  post(p: { roomId: string; from: string; body: string; transport: ChatMessage['transport'] }): ChatMessage {
    const flagged = BANNED.some((b) => p.body.toLowerCase().includes(b));
    const m: ChatMessage = { id: `msg_${++this.seq}`, ...p, ts: new Date(), flagged };
    this.messages.push(m);
    return m;
  }

  history(roomId: string, since?: Date): ChatMessage[] { return this.messages.filter((m) => m.roomId === roomId && (!since || m.ts >= since)); }
  flagged(): ChatMessage[] { return this.messages.filter((m) => m.flagged); }

  /** Retention sweep — chat content expires (E2EE bodies are opaque anyway). */
  sweep(olderThanDays: number, now = new Date()): number {
    const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000);
    const before = this.messages.length;
    this.messages = this.messages.filter((m) => m.ts >= cutoff);
    return before - this.messages.length;
  }
}

// ── SMS gateway adapter (route emergency/masked calls, OTP fallback) ────────

export interface SmsResult { to: string; messageId: string; status: 'queued' | 'sent' | 'delivered' | 'failed'; segments: number }

export class SmsGateway {
  private outbox: SmsResult[] = [];
  private seq = 0;

  /** Nigerian numbers (+234…) send; refs ending '77' fail (test hook). */
  async send(to: string, body: string): Promise<SmsResult> {
    if (!/^\+234\d{10}$/.test(to)) throw new Error(`invalid NG number ${to}`);
    const segments = Math.max(1, Math.ceil(body.length / 160));
    const r: SmsResult = { to, messageId: `sms_${++this.seq}`, status: to.endsWith('77') ? 'failed' : 'sent', segments };
    this.outbox.push(r);
    return r;
  }

  /** Delivery report ingestion (DLR). */
  reportDelivery(messageId: string, status: SmsResult['status']): SmsResult {
    const r = this.outbox.find((x) => x.messageId === messageId);
    if (!r) throw new Error(`unknown message ${messageId}`);
    r.status = status;
    return r;
  }

  list(): SmsResult[] { return [...this.outbox]; }
}
