import { InMemoryIssue } from '@/types/daytona';

/**
 * In-memory database for tracking issues and their associated workspaces
 * This is a simple implementation for Phase 1 - can be replaced with a real DB later
 */
class InMemoryDB {
  private issues: Map<number, InMemoryIssue> = new Map();

  /**
   * Stores an issue in memory
   */
  saveIssue(issue: InMemoryIssue): void {
    this.issues.set(issue.issueNumber, issue);
  }

  /**
   * Retrieves an issue by number
   */
  getIssue(issueNumber: number): InMemoryIssue | undefined {
    return this.issues.get(issueNumber);
  }

  /**
   * Updates an issue
   */
  updateIssue(issueNumber: number, updates: Partial<InMemoryIssue>): void {
    const issue = this.issues.get(issueNumber);
    if (issue) {
      this.issues.set(issueNumber, {
        ...issue,
        ...updates,
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Gets all issues
   */
  getAllIssues(): InMemoryIssue[] {
    return Array.from(this.issues.values());
  }

  /**
   * Clears all issues (useful for testing)
   */
  clear(): void {
    this.issues.clear();
  }
}

// Singleton instance
export const db = new InMemoryDB();

