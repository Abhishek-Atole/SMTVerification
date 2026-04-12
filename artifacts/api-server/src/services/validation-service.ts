import { db } from "@workspace/db";
import { bomsTable, bomItemsTable, sessionsTable } from "@workspace/db/schema";
import { ComponentService } from "./component-service";
import { FeederService } from "./feeder-service";
import { eq, and } from "drizzle-orm";

export interface ValidationResult {
  status: "pass" | "alternate_pass" | "mismatch" | "feeder_not_found";
  message: string;
  expectedMpn?: string;
  scannedMpn: string;
  matchedComponentId?: number;
  alternateUsed: boolean;
  validationResult: string;
}

export class ValidationService {
  /**
   * Core validation logic - validates component scan against BOM
   * 
   * Workflow:
   * 1. Look up BOM item by (sessionId → bomId, feederId)
   * 2. Get expected component and part ID
   * 3. If scannedMpn == expected MPN → PASS
   * 4. Else if scannedMpn in approved alternates → PASS (log as alternate)
   * 5. Else → FAIL
   */
  static async validateComponentMatch(
    sessionId: number,
    feederId: string,
    scannedMpn: string
  ): Promise<ValidationResult> {
    try {
      // Get session to find BOM
      const sessionResult = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, sessionId));

      if (sessionResult.length === 0) {
        return {
          status: "mismatch",
          message: "Session not found",
          scannedMpn,
          alternateUsed: false,
          validationResult: "session_not_found",
        };
      }

      const session = sessionResult[0];
      const bomId = session.bomId;

      // Get feeder to validate it exists
      const feeder = await FeederService.getFeederByFeederId(feederId);
      if (!feeder) {
        return {
          status: "feeder_not_found",
          message: `Feeder ${feederId} not found or inactive`,
          scannedMpn,
          alternateUsed: false,
          validationResult: "feeder_not_found",
        };
      }

      // Get BOM item for this feeder in this BOM
      const bomItemResult = await db
        .select()
        .from(bomItemsTable)
        .where(and(eq(bomItemsTable.bomId, bomId), eq(bomItemsTable.feederId, feeder.id)));

      if (bomItemResult.length === 0) {
        return {
          status: "mismatch",
          message: `No BOM item found for feeder ${feederId} in this BOM`,
          scannedMpn,
          alternateUsed: false,
          validationResult: "bom_item_not_found",
        };
      }

      const bomItem = bomItemResult[0];
      const expectedMpn = bomItem.expectedMpn;
      const componentId = bomItem.componentId;

      if (!expectedMpn || !componentId) {
        return {
          status: "mismatch",
          message: `BOM item incomplete - missing component mapping`,
          scannedMpn,
          alternateUsed: false,
          validationResult: "incomplete_bom_item",
        };
      }

      // Check if scanned MPN matches expected
      if (scannedMpn === expectedMpn) {
        return {
          status: "pass",
          message: `✓ Correct component: ${scannedMpn}`,
          expectedMpn,
          scannedMpn,
          matchedComponentId: componentId,
          alternateUsed: false,
          validationResult: "pass",
        };
      }

      // Check if scanned MPN is approved alternate
      const scannedComponent = await ComponentService.getComponentByMpn(
        scannedMpn
      );
      if (!scannedComponent) {
        return {
          status: "mismatch",
          message: `Component ${scannedMpn} not found in component master`,
          expectedMpn,
          scannedMpn,
          alternateUsed: false,
          validationResult: "component_not_found",
        };
      }

      // Check if this is an approved alternate
      const isApproved = await ComponentService.isAlternateApproved(
        componentId,
        scannedComponent.id
      );

      if (isApproved) {
        return {
          status: "alternate_pass",
          message: `⚠ Approved alternate: ${scannedMpn} (expected: ${expectedMpn})`,
          expectedMpn,
          scannedMpn,
          matchedComponentId: scannedComponent.id,
          alternateUsed: true,
          validationResult: "alternate_pass",
        };
      }

      // Not approved
      return {
        status: "mismatch",
        message: `✗ Component mismatch: Expected ${expectedMpn}, got ${scannedMpn} (not approved alternate)`,
        expectedMpn,
        scannedMpn,
        alternateUsed: false,
        validationResult: "mismatch",
      };
    } catch (error) {
      return {
        status: "mismatch",
        message: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
        scannedMpn,
        alternateUsed: false,
        validationResult: "error",
      };
    }
  }

  /**
   * Validate date code (optional - could check expiration)
   */
  static async validateDateCode(dateCode: string): Promise<boolean> {
    // Placeholder: Could implement expiration logic here
    // For now, just check format (e.g., YYWD format)
    return /^\d{4}$/.test(dateCode) || dateCode === "";
  }

  /**
   * Check for data anomalies (e.g., same MPN scanned twice in short time)
   */
  static async checkForAnomalies(
    sessionId: number,
    feederId: string,
    scannedMpn: string
  ): Promise<{ hasAnomaly: boolean; message?: string }> {
    // Could implement logic to detect unusual patterns
    return { hasAnomaly: false };
  }
}
