const POST_ID_RE = /\/pl\/([a-z0-9]+)/i;

interface LoopPost {
  message: string;
  user_id: string;
  create_at: number;
}

interface LoopThreadResponse {
  posts: Record<string, LoopPost>;
  order: string[];
}

interface LoopUser {
  username: string;
}

export class LoopService {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authHeader = `Bearer ${token}`;
  }

  private async fetchUser(userId: string): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v4/users/${userId}`, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });
      if (!res.ok) return userId;
      const data = (await res.json()) as LoopUser;
      return data.username ?? userId;
    } catch {
      return userId;
    }
  }

  async fetchThread(threadUrl: string): Promise<string | null> {
    const match = POST_ID_RE.exec(threadUrl);
    const postId = match?.[1];

    if (!postId) {
      console.warn(`[LoopService] Cannot parse postId from URL: ${threadUrl}`);
      return null;
    }

    const url = `${this.baseUrl}/api/v4/posts/${postId}/thread?perPage=200`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });
    } catch (err) {
      console.error(`[LoopService] Fetch failed for postId=${postId}:`, err);
      return null;
    }

    if (!res.ok) {
      console.warn(
        `[LoopService] API returned ${res.status} for postId=${postId}`
      );
      return null;
    }

    const data = (await res.json()) as LoopThreadResponse;
    const { posts, order } = data;

    const sortedIds = [...order].sort(
      (a, b) => (posts[a]?.create_at ?? 0) - (posts[b]?.create_at ?? 0)
    );

    const uniqueUserIds = [...new Set(sortedIds.map((id) => posts[id]?.user_id).filter(Boolean))] as string[];
    const usernameMap = new Map<string, string>();
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const username = await this.fetchUser(uid);
        usernameMap.set(uid, username);
      })
    );

    const lines: string[] = [];
    for (const id of sortedIds) {
      const post = posts[id];
      if (!post) continue;
      const username = usernameMap.get(post.user_id) ?? post.user_id;
      const ts = new Date(post.create_at).toISOString();
      lines.push(`**@${username}** (${ts}):\n${post.message}\n`);
    }

    return lines.join("\n");
  }
}
