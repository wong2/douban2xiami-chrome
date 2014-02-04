chrome.runtime.onInstalled.addListener(function(info) {
    if (info.reason == 'install') {
        // on install
        chrome.tabs.create({url: 'sync.html'});
    }
});


// modify referer
var request_options = {
    urls: ['http://douban.fm/j/play_record*', 'http://www.xiami.com/ajax/addtag'],
    types: ['xmlhttprequest']
};

chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
    var exists = false,
        url = details.url,
        v = '';

    if (url.indexOf('douban.fm') > 0) {
        v = 'http://douban.fm/mine';
    } else if (url.indexOf('xiami.com') > 0) {
        v = 'http://www.xiami.com';
    } else {
        return;
    }

    for (var i = 0; i < details.requestHeaders.length; i++) {
        var name = details.requestHeaders[i].name;
        if (name == 'Referer') {
            details.requestHeaders[i].value = v;
            exists = true;
            break;
        }
    }

    if (!exists) {
        details.requestHeaders.push({name: 'Referer', value: v});
    }

    return { 
        requestHeaders: details.requestHeaders 
    };

}, request_options, ['blocking', 'requestHeaders']);
