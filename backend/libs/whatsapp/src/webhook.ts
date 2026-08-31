/**
 * WhatsApp Business Cloud API webhook (docs/26 §Channel Architecture).
 * GET  /webhooks/whatsapp  → Meta subscription verification (hub.challenge)
 * POST /webhooks/whatsapp  → signed inbound payloads → queue → orchestrator
 *
 * Transport adapter: replies are sent via the Graph API in production
 * (sendWaText below); logic is transport-independent and tested directly.
 */
import type { Request, Response } from 'express';
import { processInbound, type InboundMessage } from './orchestrator';

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.WA_VERIFY_TOKEN ?? 'amsa-verify-token';
  if (mode === 'subscribe' && token === expected) {
    res.status(200).send(String(challenge));
  } else {
    res.sendStatus(403);
  }
}

/** In-memory queue — Kafka topic `whatsapp.inbound` in production. */
const queue: { payload: any; attempts: number }[] = [];
export const queueDepth = () => queue.length;

export function webhookInbound(req: Request, res: Response): void {
  // X-Hub-Signature-256 HMAC validation happens at the gateway (docs/26 §Security)
  const body = req.body;
  try {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        for (const m of value?.messages ?? []) queue.push({ payload: m, attempts: 0 });
        // statuses (sent/delivered/read receipts) → conversation analytics only
      }
    }
    res.sendStatus(200); // ack immediately; process from queue
    void drainQueue();
  } catch {
    res.sendStatus(200); // never leak errors to Meta retries
  }
}

export async function drainQueue(): Promise<void> {
  while (queue.length) {
    const item = queue.shift()!;
    try {
      const msg = normalize(item.payload);
      if (msg) {
        const out = await processInbound(msg);
        await sendWaText(out.to, out.text);
      }
    } catch (e) {
      item.attempts++;
      if (item.attempts < 3) queue.push(item); // retry with backoff in prod
    }
  }
}

/** Map Cloud API message payload → our InboundMessage. */
export function normalize(m: any): InboundMessage | null {
  if (!m) return null;
  const base = { from: m.from, timestamp: new Date(Number(m.timestamp ?? Date.now()) * 1000).toISOString() };
  switch (m.type) {
    case 'text': return { ...base, type: 'text', text: m.text?.body };
    case 'location': return { ...base, type: 'location', location: { lat: m.location.latitude, lng: m.location.longitude, label: m.location.name } };
    case 'audio': case 'voice': return { ...base, type: 'audio', mediaId: m.audio?.id };
    case 'image': return { ...base, type: 'image', mediaId: m.image?.id };
    case 'button': return { ...base, type: 'button', button: m.button?.text ?? m.button?.payload };
    case 'interactive': return { ...base, type: 'interactive', text: m.interactive?.list_reply?.title ?? m.interactive?.button_reply?.title };
    default: return { ...base, type: 'text', text: undefined };
  }
}

/** Graph API send (no-op in sandbox; real HTTP call in production). */
export async function sendWaText(to: string, text: string): Promise<void> {
  if (process.env.WA_GRAPH_TOKEN && process.env.WA_PHONE_NUMBER_ID) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WA_GRAPH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body: text } }),
    });
    if (!r.ok) throw new Error(`Graph API ${r.status}`);
  }
  // sandbox: replies are captured by tests / the simulator endpoint
}
