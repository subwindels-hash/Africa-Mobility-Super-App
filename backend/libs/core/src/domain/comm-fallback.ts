/**
 * Communication fallback engine (docs/05 FR-COM-005 / prompt spec:
 * "Automatically switch to direct GSM calls when internet quality is poor").
 *
 * Monitors WebRTC call quality and decides, with hysteresis, when to:
 *   WEBRTC_OK → WEBRTC_DEGRADED (reduce bitrate, warn) → PSTN_MASKED (GSM) → SMS
 * and back up when quality recovers. Used by communication-service call legs.
 */

export type CallChannel = 'webrtc' | 'webrtc_degraded' | 'pstn_masked' | 'sms';

export interface CallQualitySample {
  rttMs?: number;          // round-trip time
  packetLossPct?: number;  // loss %
  jitterMs?: number;
  mos?: number;            // mean opinion score 1.0–5.0 (optional, from WebRTC stats)
  consecutiveFailures?: number;
}

export interface FallbackDecision {
  channel: CallChannel;
  action: 'none' | 'reduce_bitrate' | 'switch_to_gsm_masked' | 'send_sms_template' | 'retry_webrtc';
  reason: string;
  notifyCustomer: boolean;
}

export interface FallbackState {
  current: CallChannel;
  poorStreak: number;
  goodStreak: number;
}

export const THRESHOLDS = {
  rttPoorMs: 400,
  lossPoorPct: 8,
  jitterPoorMs: 80,
  mosPoor: 3.2,
  poorStreakToDowngrade: 2,   // consecutive poor samples before switching
  goodStreakToUpgrade: 3,     // consecutive good samples before returning to VoIP
};

export function newFallbackState(): FallbackState {
  return { current: 'webrtc', poorStreak: 0, goodStreak: 0 };
}

function sampleIsPoor(s: CallQualitySample): boolean {
  if ((s.consecutiveFailures ?? 0) >= 2) return true;
  if (s.rttMs !== undefined && s.rttMs > THRESHOLDS.rttPoorMs) return true;
  if (s.packetLossPct !== undefined && s.packetLossPct > THRESHOLDS.lossPoorPct) return true;
  if (s.jitterMs !== undefined && s.jitterMs > THRESHOLDS.jitterPoorMs) return true;
  if (s.mos !== undefined && s.mos < THRESHOLDS.mosPoor) return true;
  return false;
}

/**
 * Feed a quality sample; returns the decision for this tick.
 * State mutates in place (call-leg scoped, Redis-backed in production).
 */
export function evaluate(sample: CallQualitySample, state: FallbackState): FallbackDecision {
  const poor = sampleIsPoor(sample);

  if (poor) {
    state.poorStreak++;
    state.goodStreak = 0;
  } else {
    state.goodStreak++;
    state.poorStreak = 0;
  }

  // Downgrade ladder (requires sustained poor quality — hysteresis avoids flapping)
  if (poor && state.poorStreak >= THRESHOLDS.poorStreakToDowngrade) {
    if (state.current === 'webrtc') {
      state.current = 'webrtc_degraded';
      return { channel: state.current, action: 'reduce_bitrate', reason: `poor quality streak ${state.poorStreak} (rtt=${sample.rttMs ?? '–'}ms loss=${sample.packetLossPct ?? '–'}% jitter=${sample.jitterMs ?? '–'}ms)`, notifyCustomer: false };
    }
    if (state.current === 'webrtc_degraded') {
      state.current = 'pstn_masked';
      return { channel: state.current, action: 'switch_to_gsm_masked', reason: 'VoIP quality below threshold after bitrate reduction — switching to masked GSM call', notifyCustomer: true };
    }
    if (state.current === 'pstn_masked') {
      // GSM itself failing (no signal / unanswered) → SMS template with key info
      state.current = 'sms';
      return { channel: state.current, action: 'send_sms_template', reason: 'GSM leg unavailable — falling back to SMS with trip/pickup details', notifyCustomer: true };
    }
    return { channel: state.current, action: 'none', reason: 'already at lowest channel', notifyCustomer: false };
  }

  // Upgrade path: sustained good quality returns to VoIP (never mid-call for GSM→VoIP)
  if (!poor && state.goodStreak >= THRESHOLDS.goodStreakToUpgrade && state.current === 'webrtc_degraded') {
    state.current = 'webrtc';
    return { channel: state.current, action: 'retry_webrtc', reason: 'quality recovered', notifyCustomer: false };
  }

  return { channel: state.current, action: 'none', reason: poor ? `poor sample (streak ${state.poorStreak})` : 'quality acceptable', notifyCustomer: false };
}

/** Customer-facing banner copy when a switch happens. */
export function fallbackNotice(d: FallbackDecision): string {
  if (d.action === 'switch_to_gsm_masked') return '📞 Network is weak — switching you to a normal call. Numbers stay masked.';
  if (d.action === 'send_sms_template') return '📶 We\'ll text you the driver & pickup details by SMS instead.';
  return '';
}
