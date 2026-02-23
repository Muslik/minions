const PAGE_ID_RE = /[?&]pageId=(\d+)|\/pages\/(\d+)/;

interface ConfluenceApiResponse {
  title: string;
  body: {
    storage: {
      value: string;
    };
  };
}

export class ConfluenceService {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authHeader = `Bearer ${token}`;
  }

  async fetchPage(
    pageUrl: string
  ): Promise<{ title: string; content: string } | null> {
    const match = PAGE_ID_RE.exec(pageUrl);
    const pageId = match?.[1] ?? match?.[2];

    if (!pageId) {
      console.warn(`[ConfluenceService] Cannot parse pageId from URL: ${pageUrl}`);
      return null;
    }

    const url = `${this.baseUrl}/rest/api/content/${pageId}?expand=body.storage,version,space`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });
    } catch (err) {
      console.error(`[ConfluenceService] Fetch failed for pageId=${pageId}:`, err);
      return null;
    }

    if (!res.ok) {
      console.warn(
        `[ConfluenceService] API returned ${res.status} for pageId=${pageId}`
      );
      return null;
    }

    const data = (await res.json()) as ConfluenceApiResponse;
    return {
      title: data.title,
      content: data.body.storage.value,
    };
  }
}
