export interface InvitationPayload {
  id: string;
  roomId: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED';
}
