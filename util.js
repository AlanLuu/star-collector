/*
 * Functions to detect mobile devices.
*/
export const isMobile = Object.freeze({
    android: function() {
        return navigator.userAgent.match(/(?=.*Android)(?=.*Mobile)/i) !== null;
    },
    blackberry: function() {
        return navigator.userAgent.match(/BlackBerry/i) !== null;
    },
    ios: function() {
        return navigator.userAgent.match(/iPhone|iPod/i) !== null;
    },
    opera: function() {
        return navigator.userAgent.match(/Opera Mini/i) !== null;
    },
    windows: function() {
        return navigator.userAgent.match(/IEMobile/i) !== null || navigator.userAgent.match(/WPDesktop/i) !== null;
    },
    any: function() {
        return isMobile.android() || isMobile.blackberry() || isMobile.ios() || isMobile.opera() || isMobile.windows();
    }
});


/**
 * Asserts that a passed in boolean value is true. If not, throws an error with the passed in error message.
 * 
 * @param bool - the boolean value to test
 * @param message - the error message to display if bool is false.
*/
export function assert(bool, message) {
    if (!bool) {
        throw new Error(message || "");
    }
}
