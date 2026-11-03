/**
 * The bridge's secret travels as a WebSocket subprotocol, so it's never in a logged address. No
 * imports, so the church bridge (bridge/) runs with Node alone and no install step.
 */
export const BRIDGE_PROTOCOL = "ifc-bridge";
