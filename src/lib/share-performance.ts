"use client";

/**
 * Development-only timing for the image-share editor.
 *
 * The tracker deliberately owns no editor state. It only records milestones,
 * so importing it cannot add work to the production interaction path. A
 * navigation starts one session; the takeover and editor can then use the
 * current session without threading an id through every component. Operation
 * tokens keep late preview/export promises from an older job or session from
 * changing the current report.
 */

export const SHARE_PERFORMANCE_ENABLED = process.env.NODE_ENV === "development";

export type SharePerformanceSessionId = string;

export type SharePreviewAction =
  | "background"
  | "classes"
  | "dates"
  | "random"
  | "style"
  | (string & {});

export type SharePerformanceOperation = Readonly<{
  sessionId: SharePerformanceSessionId;
  operationId: number;
  kind: "preview" | "export";
  action?: SharePreviewAction;
}>;

type MeasurementRow = {
  Stage: string;
  Action: string;
  "Duration (ms)": number;
};

type SharePerformanceSession = {
  id: SharePerformanceSessionId;
  prefix: string;
  marks: Map<string, number>;
  nativeMarkNames: Set<string>;
  nativeMeasureNames: Set<string>;
  rows: MeasurementRow[];
  nextMeasureId: number;
  nextOperationId: number;
  latestPreviewOperationId: number | null;
  latestExportOperationId: number | null;
  reportTimer: number | null;
};

const REPORT_DELAY_MS = 400;
const MAX_REPORT_ROWS = 12;

function available(): boolean {
  return SHARE_PERFORMANCE_ENABLED && typeof window !== "undefined";
}

function clock(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function nativePerformance(): Performance | null {
  return typeof performance !== "undefined" &&
    typeof performance.mark === "function" &&
    typeof performance.measure === "function"
    ? performance
    : null;
}

class SharePerformanceTracker {
  private current: SharePerformanceSession | null = null;
  private nextSessionId = 0;

  /** Call synchronously in the navigation tap handler, before opening Share. */
  navigationStarted(): SharePerformanceSessionId | null {
    if (!available()) return null;
    this.reset();

    const id = `share-${Date.now().toString(36)}-${++this.nextSessionId}`;
    const session: SharePerformanceSession = {
      id,
      prefix: `fittlist:share:${id}`,
      marks: new Map(),
      nativeMarkNames: new Set(),
      nativeMeasureNames: new Set(),
      rows: [],
      nextMeasureId: 0,
      nextOperationId: 0,
      latestPreviewOperationId: null,
      latestExportOperationId: null,
      reportTimer: null,
    };

    this.current = session;
    this.mark(session, "navigation-start");
    return id;
  }

  /** Mark the first committed editor chrome, independently of preview data. */
  shellRendered(sessionId?: SharePerformanceSessionId | null): void {
    const session = this.session(sessionId, true);
    if (!session || session.marks.has("shell-rendered")) return;
    this.mark(session, "shell-rendered");
    this.measure(session, "Editor shell", "", "navigation-start", "shell-rendered");
  }

  /** Mark when the minimum calendar/user data required by the preview is ready. */
  dataReady(sessionId?: SharePerformanceSessionId | null): void {
    const session = this.session(sessionId, true);
    if (!session || session.marks.has("data-ready")) return;
    this.mark(session, "data-ready");
    this.measure(session, "Data ready", "", "navigation-start", "data-ready");
  }

  /** Mark the first visible live preview (not an export-quality capture). */
  firstPreviewRendered(sessionId?: SharePerformanceSessionId | null): void {
    const session = this.session(sessionId, true);
    if (!session || session.marks.has("preview-first-rendered")) return;
    this.mark(session, "preview-first-rendered");
    this.measure(
      session,
      "Initial preview",
      "",
      "navigation-start",
      "preview-first-rendered",
    );
    this.scheduleReport(session);
  }

  /**
   * Start timing an edit before updating local configuration state. Pass the
   * returned token to previewRendered after React has painted that change.
   */
  previewUpdateStarted(
    action: SharePreviewAction,
    sessionId?: SharePerformanceSessionId | null,
  ): SharePerformanceOperation | null {
    const session = this.session(sessionId);
    if (!session) return null;

    const operationId = ++session.nextOperationId;
    session.latestPreviewOperationId = operationId;
    this.mark(session, `preview-${operationId}-start`);
    return { sessionId: session.id, operationId, kind: "preview", action };
  }

  /** Late results from an older preview operation are intentionally ignored. */
  previewRendered(operation: SharePerformanceOperation | null | undefined): void {
    const session = this.operationSession(operation, "preview");
    if (!session || session.latestPreviewOperationId !== operation?.operationId) return;

    const end = `preview-${operation.operationId}-rendered`;
    this.mark(session, end);
    this.measure(
      session,
      "Preview update",
      operation.action ?? "edit",
      `preview-${operation.operationId}-start`,
      end,
    );
    this.scheduleReport(session);
  }

  /** Snapshot editor configuration, then call this once before final capture. */
  exportStarted(
    sessionId?: SharePerformanceSessionId | null,
  ): SharePerformanceOperation | null {
    const session = this.session(sessionId, true);
    if (!session) return null;

    const operationId = ++session.nextOperationId;
    session.latestExportOperationId = operationId;
    this.mark(session, `export-${operationId}-start`);
    return { sessionId: session.id, operationId, kind: "export" };
  }

  /** Mark when the server-rendered PNG response has fully reached a Blob. */
  captureCompleted(operation: SharePerformanceOperation | null | undefined): void {
    const session = this.operationSession(operation, "export");
    if (!session || session.latestExportOperationId !== operation?.operationId) return;

    const end = `export-${operation.operationId}-capture`;
    if (session.marks.has(end)) return;
    this.mark(session, end);
    this.measure(
      session,
      "Final image generation",
      "",
      `export-${operation.operationId}-start`,
      end,
    );
  }

  /** Mark after the already-encoded response Blob has become a shareable File. */
  encodingCompleted(operation: SharePerformanceOperation | null | undefined): void {
    const session = this.operationSession(operation, "export");
    if (!session || session.latestExportOperationId !== operation?.operationId) return;

    const end = `export-${operation.operationId}-encode`;
    if (session.marks.has(end)) return;
    this.mark(session, end);
    const capture = `export-${operation.operationId}-capture`;
    this.measure(
      session,
      "Share file creation",
      "",
      session.marks.has(capture) ? capture : `export-${operation.operationId}-start`,
      end,
    );
  }

  /** Mark immediately before the file/native share sheet is made available. */
  shareReady(operation: SharePerformanceOperation | null | undefined): void {
    const session = this.operationSession(operation, "export");
    if (!session || session.latestExportOperationId !== operation?.operationId) return;

    const end = `export-${operation.operationId}-share-ready`;
    if (session.marks.has(end)) return;
    this.mark(session, end);
    this.measure(
      session,
      "Share ready",
      "",
      `export-${operation.operationId}-start`,
      end,
    );
    this.scheduleReport(session, 0);
  }

  /** Print the most recent milestones now; useful at the end of a test flow. */
  report(sessionId?: SharePerformanceSessionId | null): void {
    const session = this.session(sessionId);
    if (!session || session.rows.length === 0) return;

    if (session.reportTimer !== null) {
      window.clearTimeout(session.reportTimer);
      session.reportTimer = null;
    }
    const rows = session.rows.slice(-MAX_REPORT_ROWS);
    console.table(rows);
    // A dev-only, read-only hook lets browser automation capture the same
    // measurements without monkey-patching console or shipping telemetry.
    document.documentElement.dataset.sharePerformance = JSON.stringify(rows);
  }

  /** End the active editor session and invalidate all outstanding job tokens. */
  reset(sessionId?: SharePerformanceSessionId | null): void {
    if (!this.current || (sessionId && this.current.id !== sessionId)) return;

    const session = this.current;
    if (session.reportTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(session.reportTimer);
    }

    const native = nativePerformance();
    if (native) {
      for (const name of session.nativeMarkNames) native.clearMarks(name);
      for (const name of session.nativeMeasureNames) native.clearMeasures(name);
    }
    if (typeof document !== "undefined") {
      delete document.documentElement.dataset.sharePerformance;
    }
    this.current = null;
  }

  private session(
    sessionId?: SharePerformanceSessionId | null,
    createIfMissing = false,
  ): SharePerformanceSession | null {
    if (!available()) return null;
    if (!this.current && createIfMissing) this.navigationStarted();
    if (!this.current || (sessionId && this.current.id !== sessionId)) return null;
    return this.current;
  }

  private operationSession(
    operation: SharePerformanceOperation | null | undefined,
    kind: SharePerformanceOperation["kind"],
  ): SharePerformanceSession | null {
    if (!operation || operation.kind !== kind) return null;
    return this.session(operation.sessionId);
  }

  private mark(session: SharePerformanceSession, key: string): void {
    session.marks.set(key, clock());
    const native = nativePerformance();
    if (!native) return;

    const name = `${session.prefix}:${key}`;
    try {
      native.mark(name);
      session.nativeMarkNames.add(name);
    } catch {
      // Stored timestamps still provide the report in restricted browsers.
    }
  }

  private measure(
    session: SharePerformanceSession,
    stage: string,
    action: string,
    startKey: string,
    endKey: string,
  ): void {
    const start = session.marks.get(startKey);
    const end = session.marks.get(endKey);
    if (start === undefined || end === undefined) return;

    session.rows.push({
      Stage: stage,
      Action: action,
      "Duration (ms)": Math.round(Math.max(0, end - start) * 10) / 10,
    });

    const native = nativePerformance();
    if (!native) return;

    const measureName = `${session.prefix}:measure:${++session.nextMeasureId}:${stage
      .toLowerCase()
      .replace(/\s+/g, "-")}`;
    try {
      native.measure(
        measureName,
        `${session.prefix}:${startKey}`,
        `${session.prefix}:${endKey}`,
      );
      session.nativeMeasureNames.add(measureName);
    } catch {
      // Some embedded Safari contexts expose Performance but reject marks.
    }
  }

  private scheduleReport(session: SharePerformanceSession, delay = REPORT_DELAY_MS): void {
    if (session !== this.current || typeof window === "undefined") return;
    if (session.reportTimer !== null) window.clearTimeout(session.reportTimer);
    session.reportTimer = window.setTimeout(() => {
      if (session !== this.current) return;
      session.reportTimer = null;
      this.report(session.id);
    }, delay);
  }
}

export const sharePerformance = new SharePerformanceTracker();
