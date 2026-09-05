// =========================================
// WebRTC ICE compatibility shim
// =========================================
// Intentionally disabled.
//
// The original call implementation already performs its own ICE candidate
// signalling. Do not override RTCPeerConnection.prototype.setLocalDescription
// here: delaying setLocalDescription() changes the timing of the existing
// WebRTC signalling flow and can break the previously working iPhone-to-iPhone
// direct connection.
//
// This file is kept so the current index.html does not need an unnecessary
// architecture change. The native WebRTC API is left untouched.
