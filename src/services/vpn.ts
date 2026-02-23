import { execSync } from "child_process";

export class VpnService {
  private serviceName: string;
  private refCount = 0;

  constructor(serviceName = "openvpn-client@ott") {
    this.serviceName = serviceName;
  }

  async up(): Promise<void> {
    this.refCount++;
    if (this.refCount > 1) return; // already up

    if (this.isActive()) return;

    execSync(`sudo systemctl start ${this.serviceName}`, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30_000,
    });

    // Wait for tun0 to appear (up to 15s)
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (this.isActive()) return;
    }

    throw new Error("VPN failed to come up within 15s");
  }

  async down(): Promise<void> {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return; // other runs still need it

    if (!this.isActive()) return;

    execSync(`sudo systemctl stop ${this.serviceName}`, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
    });
  }

  private isActive(): boolean {
    try {
      const result = execSync(
        `systemctl is-active ${this.serviceName}`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      return result === "active";
    } catch {
      return false;
    }
  }
}
