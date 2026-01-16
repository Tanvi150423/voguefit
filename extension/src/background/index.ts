console.log('[VogueFit] Background service worker loaded');

chrome.runtime.onInstalled.addListener(() => {
    console.log('[VogueFit] Extension installed');
});
