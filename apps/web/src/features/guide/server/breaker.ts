import "server-only";

/**
 * A small circuit breaker (spec §5.2 step 2): after 5 Claude failures within a minute, the
 * guide serves its fallback copy for 60 seconds instead of calling Claude. Per server instance,
 * which is the cheap version the production-readiness skill recommends at this scale.
 */
export class CircuitBreaker {
  private failures: number[] = [];
  private openUntil = 0;

  constructor(
    private readonly threshold = 5,
    private readonly windowMs = 60_000,
    private readonly cooldownMs = 60_000,
  ) {}

  isOpen(now: number = Date.now()): boolean {
    return now < this.openUntil;
  }

  recordFailure(now: number = Date.now()): void {
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.threshold) {
      this.openUntil = now + this.cooldownMs;
      this.failures = [];
    }
  }

  recordSuccess(): void {
    this.failures = [];
  }
}

export const guideBreaker = new CircuitBreaker();
