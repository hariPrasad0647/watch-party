export interface ChatMessagePayload {
  id: string;
  roomId: string;
  sender: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  content: string;
  createdAt: string; // ISO string
}
