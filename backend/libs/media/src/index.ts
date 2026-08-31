/**
 * Media Service (docs/08 media-service).
 * Amazon S3 presigned uploads per asset class (private vendor docs, cargo
 * proofs, avatars), completion + scan verdicts, image variants, access control
 * and retention. Signatures are deterministic HMACs (offline mode).
 */
import { createHmac } from 'node:crypto';

export type AssetClass = 'vendor_documents' | 'cargo_proofs' | 'kyc_documents' | 'avatars' | 'dispute_evidence' | 'chat_media';
export type Acl = 'private' | 'platform-read' | 'public-read';

export const ASSET_POLICY: Record<AssetClass, { acl: Acl; maxBytes: number; retentionDays: number; scan: boolean }> = {
  vendor_documents: { acl: 'private', maxBytes: 10 * 1024 * 1024, retentionDays: 2555, scan: true },   // 7y
  kyc_documents:    { acl: 'private', maxBytes: 10 * 1024 * 1024, retentionDays: 1825, scan: true },   // 5y (NDPR)
  cargo_proofs:     { acl: 'platform-read', maxBytes: 15 * 1024 * 1024, retentionDays: 365, scan: true },
  dispute_evidence: { acl: 'private', maxBytes: 25 * 1024 * 1024, retentionDays: 1095, scan: true },   // legal hold
  chat_media:       { acl: 'private', maxBytes: 20 * 1024 * 1024, retentionDays: 90, scan: true },
  avatars:          { acl: 'public-read', maxBytes: 2 * 1024 * 1024, retentionDays: -1, scan: false },
};

export interface Upload { uploadId: string; objectKey: string; assetClass: AssetClass; uploadedBy: string; status: 'presigned' | 'quarantined' | 'clean'; variants?: string[]; bytes: number; createdAt: Date }

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'heic'];

export class MediaService {
  private uploads = new Map<string, Upload>();
  private seq = 0;

  constructor(private bucket = 'amsa-media', private secret = 'amsa-s3-offline') {}

  /** Presign a PUT — filename ending '.exe' triggers the scan quarantine path in tests. */
  presign(p: { assetClass: AssetClass; uploadedBy: string; filename: string; bytes: number }): { uploadId: string; objectKey: string; url: string; expiresAt: Date; acl: Acl } {
    const policy = ASSET_POLICY[p.assetClass];
    const ext = p.filename.split('.').pop()!.toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) throw new Error(`extension .${ext} not allowed`);
    if (p.bytes > policy.maxBytes) throw new Error(`${p.filename} exceeds ${(policy.maxBytes / 1024 / 1024).toFixed(0)}MB limit for ${p.assetClass}`);
    const uploadId = `upl_${++this.seq}`;
    const objectKey = `${p.assetClass}/${p.uploadedBy}/${uploadId}_${p.filename}`;
    const sig = createHmac('sha256', this.secret).update(`PUT|${objectKey}|${p.bytes}`).digest('base64url').slice(0, 24);
    const url = `https://${this.bucket}.s3.amazonaws.com/${objectKey}?X-UploadId=${uploadId}&X-Signature=${sig}`;
    this.uploads.set(uploadId, { uploadId, objectKey, assetClass: p.assetClass, uploadedBy: p.uploadedBy, status: 'presigned', bytes: p.bytes, createdAt: new Date() });
    return { uploadId, objectKey, url, expiresAt: new Date(Date.now() + 15 * 60_000), acl: policy.acl };
  }

  /** Confirm upload → virus scan verdict → variants for images. */
  complete(uploadId: string): Upload {
    const u = this.uploads.get(uploadId);
    if (!u) throw new Error(`unknown upload ${uploadId}`);
    if (u.status !== 'presigned') throw new Error('upload already completed');
    const infected = u.objectKey.includes('virus');   // deterministic scan hook (real ClamAV in prod)
    u.status = infected ? 'quarantined' : 'clean';
    if (!infected && !u.objectKey.endsWith('.pdf')) u.variants = ['original', 'medium', 'thumb'];
    return u;
  }

  /** Access check — private assets need a platform relationship (owner, admin, compliance). */
  canAccess(uploadId: string, requester: { userId: string; roles: string[]; ownerOf?: string }): boolean {
    const u = this.uploads.get(uploadId);
    if (!u) return false;
    const acl = ASSET_POLICY[u.assetClass].acl;
    if (acl === 'public-read') return true;
    if (u.uploadedBy === requester.userId) return true;
    if (requester.roles.includes('admin') || requester.roles.includes('compliance')) return acl === 'private' || acl === 'platform-read';
    if (acl === 'platform-read') return true;
    return false;
  }

  get(uploadId: string): Upload | undefined { return this.uploads.get(uploadId); }
  list(assetClass?: AssetClass): Upload[] { return [...this.uploads.values()].filter((u) => !assetClass || u.assetClass === assetClass); }

  /** Retention sweep — deletes uploads past policy (data-lifecycle hook). */
  retentionSweep(now = new Date()): { deleted: string[]; retained: string[] } {
    const deleted: string[] = []; const retained: string[] = [];
    for (const u of this.uploads.values()) {
      const days = ASSET_POLICY[u.assetClass].retentionDays;
      const age = (now.getTime() - u.createdAt.getTime()) / 86_400_000;
      if (days !== -1 && age > days) { deleted.push(u.objectKey); this.uploads.delete(u.uploadId); }
      else retained.push(u.objectKey);
    }
    return { deleted, retained };
  }
}
