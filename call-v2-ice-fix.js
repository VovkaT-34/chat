// =========================================
// WebRTC ICE gathering compatibility for iPhone/Safari
// Must load BEFORE call-v2.js.
// =========================================
(function () {
    "use strict";

    if (window.__chatCallIceFixInstalled) return;
    window.__chatCallIceFixInstalled = true;

    const NativeSetLocalDescription = RTCPeerConnection.prototype.setLocalDescription;

    function waitForIceGatheringComplete(pc, timeout = 3500) {
        if (!pc || pc.iceGatheringState === "complete") {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            let finished = false;

            const finish = () => {
                if (finished) return;
                finished = true;
                pc.removeEventListener("icegatheringstatechange", onStateChange);
                resolve();
            };

            const onStateChange = () => {
                if (pc.iceGatheringState === "complete") finish();
            };

            pc.addEventListener("icegatheringstatechange", onStateChange);
            setTimeout(finish, timeout);
        });
    }

    RTCPeerConnection.prototype.setLocalDescription = async function (description) {
        await NativeSetLocalDescription.call(this, description);
        await waitForIceGatheringComplete(this);
        return this.localDescription;
    };

    window.__chatCallWaitForIceGathering = waitForIceGatheringComplete;
})();
