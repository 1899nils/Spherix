export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export type UserPublic = Omit<User, 'email'>;

export interface UserSettings {
  userId: string;
  lastfmUsername: string | null;
  lastfmSessionKey: string | null;
  theme: string;
}
