function get_cookie(url, name, callback) {
    chrome.cookies.get({
        url: url,
        name: name
    }, function(cookie) {
        if (!cookie) {
            callback('');
        } else {
            callback(cookie.value);
        }
    });
}

var DoubanFM = {
    get_cookie: function(name, callback) {
        var url = 'http://douban.fm';
        get_cookie(url, name, function(cookie) {
            callback(null, cookie);
        });
    },
    set_like_url: function(callback) {
        var self = this;
        async.map(['ck', 'bid'], this.get_cookie, function(err, results) {
            var ck = results[0].slice(1, -1),
                bid = results[1].slice(1, -1);

            if (!ck) {
                self.cookie = false;
                callback();
                return;
            } else {
                self.cookie = true;
            }

            self.like_url = 'http://douban.fm/j/play_record?type=like' +
                '&ck=' + ck + '&spbid=' + encodeURIComponent('::' + bid);

            callback();
        });
    },
    fetch_songs: function(start, callback) {
        var url = this.like_url + '&start=' + start;
        $.getJSON(url, callback);
    }
};

var Xiami = {
    get_cookie: function(name, callback) {
        var url = 'http://www.xiami.com';
        get_cookie(url, name, function(cookie) {
            callback(null, cookie);
        });
    },
    set_token: function(callback) {
        var self = this;
        async.map(['_xiamitoken', 'user'], this.get_cookie, function(err, results) {
            var token = results[0],
                user = results[1];
            if (!user) {
                self.cookie = false;
                callback();
                return
            } else {
                self.cookie = true;
            }
            self.token = token;
            callback();
        });
    },
    get_xiami_id: function(douban_song, callback) {
        var kw = douban_song.title + '+' + douban_song.artist;
        var url = 'http://www.xiami.com/collect/ajaxsearch';
        $.getJSON(url, {key: kw, style: 'new'}, function(data) {
            var res_html = data.msg;
            var match = res_html.match(/\'(\d+)\'/);
            if (match) {
                var id = match[1];
                callback(id);
            } else {
                callback(null);
            }
        });
    },
    add_to_fav: function(xiami_id, callback) {
        var url = 'http://www.xiami.com/ajax/addtag';
        $.post(url, {
            id: xiami_id,
            type: 3,
            share: 0,
            shareTo: 'all',
            _xiamitoken: this.token
        }, function() {
            callback();
        });
    },
    search: function(song_title, callback) {
        var url = 'http://www.xiami.com/collect/ajaxsearch';
        $.getJSON(url, {key: song_title, style: 'new'}, function(data) {
            var html = data.msg,
                dom = $('<ul></ul>').append(html),
                results = [];

            dom.find('li').each(function(i, li) {
                var as = $(li).find('.song_name a'),
                    a1 = as[0], a2 = as[1];

                var m = a1.href.match(/(\d+)/);
                if (!m) {
                    return;
                }

                results.push({
                    id: m[1],
                    title: a1.innerHTML,
                    artist: a2.innerHTML
                });
            });

            callback(results);
        });
    }
};


function sync() {
    var douban_songs = DoubanFM.songs,
        missing_songs = [],
        success_songs = [];

    async.eachSeries(douban_songs, function(song, callback) {
        $.publish('xiami-matching', song);
        Xiami.get_xiami_id(song, function(xiami_id) {
            if (xiami_id) {
                Xiami.add_to_fav(xiami_id, callback);
                success_songs.push(song);
            } else {
                missing_songs.push(song);
                callback();
            }
        });
    }, function() {
        $.publish('xiami-matching-end', {
            missing_songs: missing_songs,
            total_count: douban_songs.length,
            success_count: success_songs.length
        });
    });
}

function start() {
    $.publish('fetch-douban-songs-start');

    var douban_songs = [], 
        current_start = 0;

    DoubanFM.fetch_songs(current_start, function(data) {
        douban_songs = douban_songs.concat(data.songs);
        if (data.start + data.songs.length >= data.total) {
            DoubanFM.songs = douban_songs;
            $.publish('fetch-douban-songs-end', douban_songs.length);
        } else {
            current_start += data.per_page;
            $.publish('fetch-douban-songs-update', current_start);
            DoubanFM.fetch_songs(current_start, arguments.callee);
        }
    });
}


$('#start-btn').click(function() {

    // get the cookies and start !
    async.parallel([
        DoubanFM.set_like_url.bind(DoubanFM),
        Xiami.set_token.bind(Xiami)
    ], function() {
        var error = [];
        if (!Xiami.token) {
            error.push('虾米');
        }
        if (!DoubanFM.cookie) {
            error.push('豆瓣电台');
        }
        if (error.length) {
            $('#login-alert-text').text('请先登录一下' + error.join('和'));
            $('#login-alert').show();
        } else {
            $('#step1').hide();
            start();
        }
    });

});

$('#start-sync-btn').click(function() {
    $('#step3').hide();
    $('#step4').show();
    sync();
});

$.subscribe('fetch-douban-songs-start', function() {
    $('#step2').show();
});

$.subscribe('fetch-douban-songs-update', function(e, song_count) {
    var html = '已找到' + song_count + '首红心歌曲';
    $('#douban-song-fetch-status').html(html);
});

$.subscribe('fetch-douban-songs-end', function(e, count) {
    $('#step2').hide();

    var html = '共找到' + count + '首豆瓣红心歌曲';
    $('#douban-song-fetch-result').html(html);
    var song = DoubanFM.songs[Math.floor(Math.random() * DoubanFM.songs.length)];
    html = '你也喜欢' + song.artist + '的' + song.title + '？！';
    $('#douban-song-east-egg').html(html);

    $('#step3').show();
});

$.subscribe('xiami-matching', function(e, song) {
    var html = '匹配同步：' + song.title + ' ' + song.artist;
    $('#xiami-matching-song').html(html);
});

$.subscribe('xiami-matching-end', function(e, data) {
    $('#step4').hide();
    $('#step5').show();

    var html = '自动匹配并同步了' + data.total_count + 
        '首歌中的' + data.success_count + '首';

    $('#xiami-matching-result').html(html);

    var missing_length = data.missing_songs.length;
    if (!missing_length) {
        $('#go-to-xiami').show();
        return;
    }

    $('#missing-tip-count').html(missing_length);
    $('#missing-process').show();

    $('#no-manual-missing').click(function() {
        $('#missing-process').hide();
        $('#go-to-xiami').show();
    });

    $('#manual-missing').click(function() {
        $.publish('manual-matching-start', data.missing_songs);
    });
});


$.subscribe('manual-matching-start', function() {
    $('#step5').hide();
    $('#step6').show();

    var songs = [].slice.call(arguments, 1);
    start_manual_match(songs);
});


function start_manual_match(songs) {
    var current_index = -1, 
        song = null,
        len = songs.length;

    var next = function() {
        current_index += 1;
        if (current_index >= len) {
            $.publish('manual-matching-end');
            return;
        }
        song = songs[current_index];
        render_manual_selector(song, current_index, len);
    };

    $('#manual-pass').click(next);
    $('#manual-pass-all').click(function() {
        $.publish('manual-matching-end');
    });
    $('#manual-selector').on('click', '.manual-selector-option', function() {
        var song_id = $(this).data('sid');
        Xiami.add_to_fav(song_id, next);
    });

    next();
}

function render_manual_selector(song, index, length) {
    var t = song.title + ' - ' + song.artist + 
        '  (' + (index+1) + '/' + length + ')';
    $('#manual-song-title').html(t);
    $('#manual-selector').html('...');
    Xiami.search(song.title, function(results) {
        var res_html = '';
        if (!results.length) {
            res_html = '<center>没有搜索到</center>';
        } else {
            var templ = $('#manual-selector-opt-tmpl').html();
            res_html = $.map(results, function(result) {
                return templ.replace('{title}', result.title)
                            .replace('{artist}', result.artist)
                            .replace('{sid}', result.id);
            }).join('');
        }
        $('#manual-selector').html(res_html);
    });
}

$.subscribe('manual-matching-end', function() {
    $('#step6').hide();
    $('#missing-process').hide();
    $('#xiami-matching-result').hide();
    $('#go-to-xiami').show();
    $('#step5').show();
});

$('#login-alert-close').click(function() {
    $('#login-alert').hide();
});
