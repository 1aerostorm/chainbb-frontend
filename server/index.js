const koa = require('koa')
const koaRouter = require('koa-router')
const cors = require('koa-cors');
const livereload = require('koa-livereload');
const golos = require('golos-classic-js');
const gmailSend = require('gmail-send');
const fs = require('fs');
const atob = require('atob');
const btoa = require('btoa');

const CONFIG = require('../config');
const CONFIG_SEC = require('../configSecure');

golos.config.set('websocket', CONFIG.GOLOS_NODE);

const app = new koa();
const router = new koaRouter();

const returnError = (ctx, err) => {
    ctx.body = {
        "data": err,
        "network": {}, 
        "status": "err"
    };
};

const PREFIX = 'g.f.';
const PREFIX_PST = 'g.pst.f.';

const LST = '.lst';
const ACCS = '.accs';

const GLOBAL_ID = CONFIG.FORUM._id.toLowerCase();
const NOTE_     = PREFIX + GLOBAL_ID;
const NOTE_PST_ = PREFIX_PST + GLOBAL_ID;
const NOTE_PST_HIDMSG_LST      = NOTE_PST_ + '.hidmsg' + LST;
const NOTE_PST_HIDMSG_LST_ACCS = NOTE_PST_ + '.hidmsg' + LST + ACCS;
const NOTE_PST_HIDACC_LST      = NOTE_PST_ + '.hidacc' + LST;
const NOTE_PST_HIDACC_LST_ACCS = NOTE_PST_ + '.hidacc' + LST + ACCS;

let getValues = async (keys) => {
    let vals = await golos.api.getValues(CONFIG.FORUM.creator, Object.keys(keys));
    for (let [key, type] of Object.entries(keys)) {
        const fallback = (type == Object) ? {} : [];
        if (!vals[key]) {
            vals[key] = fallback;
            continue;
        }
        try {
            vals[key] = JSON.parse(vals[key]);
        } catch (ex) {
            vals[key] = fallback;
        }
    }
    return vals;
};

router.get('/', async (ctx) => {
    let keys = {};
    keys[NOTE_] = Object;
    keys[NOTE_PST_HIDMSG_LST_ACCS] = Array;
    keys[NOTE_PST_HIDACC_LST_ACCS] = Array;

    let vals = await getValues(keys);
    let tags = [];
    for (let _id in vals[NOTE_]) {
        const tag = "fm-" + GLOBAL_ID + "-" + _id.toLowerCase();
        tags.push(tag);
    }
    tags = await golos.api.getTags(tags);
    for (let _id in vals[NOTE_]) {
        const tag = "fm-" + GLOBAL_ID + "-" + _id.toLowerCase();
        vals[NOTE_][_id].stats = tags[tag] || {top_posts: 0, comments: 0};
        const data = await golos.api.getAllDiscussionsByActive(
            '', '', 1,
            "fm-" + GLOBAL_ID + "-" + _id.toLowerCase(),
            0, 0
        );
        if (data.length) {
            vals[NOTE_][_id].last_post = data.length ? data[0] : null;
            const replies = await golos.api.getContentReplies(data[0].author, data[0].permlink, 0, 0);
            if (replies.length)
                vals[NOTE_][_id].last_reply = replies[replies.length - 1];
        }
    }

    ctx.body = {
        data: {
            'forums': vals[NOTE_],
            'moders': vals[NOTE_PST_HIDMSG_LST_ACCS],
            'supers': vals[NOTE_PST_HIDACC_LST_ACCS],
            'admins': [],
            'users': {
                'stats': {
                    'total': 1,
                    'app': 0,
                },
                'list': []
            }
        }, 
        "network": {}, 
        "status": "ok"
    }
});

router.get('/forums', async (ctx) => {
    let keys = {};
    keys[NOTE_] = Object;
    const vals = await getValues(keys);
    ctx.body = {
        data: {
            'forums': vals[NOTE_],
        }, 
        "network": {}, 
        "status": "ok"
    }
})

function findForum(vals, forum_id, trail = []) {
    for (let [_id, forum] of Object.entries(vals)) {
        if (_id.toLowerCase() === forum_id.toLowerCase()) {
            forum.creator = 'cyberfounder';
            forum.tags = ['fm-' + GLOBAL_ID + '-' + _id.toLowerCase(), 'fm-' + GLOBAL_ID];
            forum.trail = [...trail, {
                _id,
                name: forum.name,
                name_ru: forum.name_ru
            }];
            return {_id, forum};
        }
        if (!forum.children) continue;
        let inChild = findForum(forum.children, forum_id, [...trail, {
            _id,
            name: forum.name,
            name_ru: forum.name_ru
        }]);
        if (inChild) return inChild;
    }
    return null;
}

router.get('/forum/:slug', async (ctx) => {
    let keys = {};
    keys[NOTE_] = Object;
    keys[NOTE_PST_HIDMSG_LST] = Array;
    keys[NOTE_PST_HIDMSG_LST_ACCS] = Array;
    keys[NOTE_PST_HIDACC_LST_ACCS] = Array;
    const vals = await getValues(keys);

    const forum_id = ctx.params.slug;
    let {_id, forum} = findForum(vals[NOTE_], forum_id);

    let tags = [];
    for (let _id in forum.children) {
        forum.children[_id].tags = ['fm-' + GLOBAL_ID + '-' + _id.toLowerCase(), 'fm-' + GLOBAL_ID];
        tags.push(forum.children[_id].tags[0]);
    }
    tags = await golos.api.getTags(tags);
    for (let _id in forum.children) {
        forum.children[_id].stats = tags[forum.children[_id].tags[0]] || {top_posts: 0, comments: 0};
        const data = await golos.api.getAllDiscussionsByActive(
            '', '', 1,
            "fm-" + GLOBAL_ID + "-" + _id.toLowerCase(),
            0, 0
        );
        if (data.length) {
            forum.children[_id].last_post = data[0];
            const replies = await golos.api.getContentReplies(data[0].author, data[0].permlink, 0, 0);
            if (replies.length)
                forum.children[_id].last_reply = replies[replies.length - 1];
        }
    }

    const data = await golos.api.getAllDiscussionsByActive(
        '', '', 10000000,
        "fm-" + GLOBAL_ID + "-" + _id.toLowerCase(),
        0, 20
    );

    const hidden = vals[NOTE_PST_HIDMSG_LST];
    for (let post of data) {
        post.hidden = !!hidden[post.id];

        const replies = await golos.api.getContentReplies(post.author, post.permlink, 0, 0);
        if (replies.length) {
            const reply = replies[replies.length - 1];
            post.last_reply = reply.created;
            post.last_reply_by = reply.author;
            post.last_reply_url = reply.url;
        } else {
            post.last_reply = post.created;
            post.last_reply_by = post.author;
            post.last_reply_url = post.url;
        }
    }

    ctx.body = {
        data: data, 
        "network": {}, 
        "status": "ok",
        forum: forum,
        children: forum ? Object.assign({}, forum.children) : null,
        moders: vals[NOTE_PST_HIDMSG_LST_ACCS],
        supers: vals[NOTE_PST_HIDACC_LST_ACCS],
        admins: [],
        hidden: hidden,
        meta: {'query':{},'sort':{}}
    }
})

const DEFAULT_VOTE_LIMIT = 10000

router.get('/:category/@:author/:permlink', async (ctx) => {
    let keys = {};
    keys[NOTE_] = Object;
    const vals = await getValues(keys);

    let data = await golos.api.getContent(ctx.params.author, ctx.params.permlink, DEFAULT_VOTE_LIMIT);
    data.donate_list = [];
    data.donate_uia_list = [];
    ctx.body = {
        data: data,
        forum: findForum(vals[NOTE_], ctx.params.category).forum,
        "network": {}, 
        "status": "ok"
    }
})

router.get('/:category/@:author/:permlink/responses', async (ctx) => {
    let data = await golos.api.getAllContentReplies(ctx.params.author, ctx.params.permlink, DEFAULT_VOTE_LIMIT);
    for (let item of data) {
        item.donate_list = [];
        item.donate_uia_list = [];
    }
    ctx.body = {
        data: data,
        "network": {}, 
        "status": "ok"
    }
})

router.get('/:category/@:author/:permlink/donates', async (ctx) => {
    const donate_list = await golos.api.getDonates(false, {author: ctx.params.author, permlink: ctx.params.permlink}, '', '', 200, 0, false);
    const donate_uia_list = await golos.api.getDonates(true, {author: ctx.params.author, permlink: ctx.params.permlink}, '', '', 200, 0, false);
    ctx.body = {
        data: {donate_list, donate_uia_list},
        "network": {}, 
        "status": "ok"
    }
})

router.get('/@:author', async (ctx) => {
    const data = await golos.api.getAccounts([ctx.params.author]);
    ctx.body = {
        data: data[0],
        "network": {}, 
        "status": "ok"
    }
})

getRandomArbitrary = (min, max) => {
    return parseInt(Math.random() * (max - min) + min);
}

router.get('/send_email/:email/:locale/:username/:owner/:active/:posting/:memo', async (ctx) => {
    if (!CONFIG_SEC.gmail_send.user || !CONFIG_SEC.gmail_send.pass)
        return returnError(ctx, 'Mail service is not configured. Admin should configure it like this:<pre>\
            {\n\
                gmail_send: {\n\
                    user: \'vasya.pupkin\',\n\
                    pass: \'gmail application password\'\n\
                }\n\
            }</pre>');

    const veri_code = getRandomArbitrary(1000, 9999);

    let html = CONFIG_SEC.registrar[ctx.params.locale].email_html;
    if (!html.includes('{verification_code}')) {
        return returnError(ctx, 'email_html in config has wrong format. It does not contain <code>{verification_code}</code>. Admin should configure it like this:<pre>email_html: \'Your verification code: <h4>{verification_code}</h4>\'</pre>');
    }
    html = html.replace('{verification_code}', veri_code);
    html = html.replace('{FORUM.logo_title}', CONFIG.FORUM[ctx.params.locale].logo_title);

    let sbj = CONFIG_SEC.registrar[ctx.params.locale].email_subject;
    sbj = sbj.replace('{FORUM.logo_title}', CONFIG.FORUM[ctx.params.locale].logo_title);

    const {username, owner, active, posting, memo} = ctx.params;
    let file_obj = {username, owner, active, posting, memo};
    file_obj.code = veri_code;

    fs.writeFileSync('verification_codes/' + btoa(ctx.params.email) + '.txt', JSON.stringify(file_obj));

    const send = gmailSend({
      user: CONFIG_SEC.gmail_send.user,
      pass: CONFIG_SEC.gmail_send.pass,
      from: CONFIG_SEC.registrar.email_sender,
      to: ctx.params.email,
      subject: sbj,
    });

    try {
        const res = await send({
            html
        });
        ctx.body = {
            "data": ctx.params.email,
            "network": {}, 
            "status": "ok"
        }
    } catch (e) {
        console.log(e)
        return returnError(ctx, JSON.stringify(e));
    }
})

router.get('/verify_email/:email/:code', async (ctx) => {
    const path = 'verification_codes/' + btoa(ctx.params.email) + '.txt';
    let file_obj = null;
    try {
        file_obj = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch (e) {
        return returnError(ctx, 'Wrong code');
    }
    if (file_obj.code != ctx.params.code) {
        return returnError(ctx, 'Wrong code');
    }

    let aro = null;
    if (CONFIG_SEC.registrar.referer) {
        let max_referral_interest_rate;
        let max_referral_term_sec;
        let max_referral_break_fee;
        try {
            const chain_properties = await golos.api.getChainPropertiesAsync();
            max_referral_interest_rate = chain_properties.max_referral_interest_rate;
            max_referral_term_sec = chain_properties.max_referral_term_sec;
            max_referral_break_fee = chain_properties.max_referral_break_fee;
        } catch (error) {
            console.error('Error in verify_email get_chain_properties', error);
        }

        const dgp = await golos.api.getDynamicGlobalPropertiesAsync();
        aro = [
            0, {
                referrer: CONFIG_SEC.registrar.referer,
                interest_rate: max_referral_interest_rate,
                end_date: new Date(Date.parse(dgp.time) + max_referral_term_sec*1000).toISOString().split(".")[0],
                break_fee: max_referral_break_fee
            }
        ];
    }
    let accs = null;
    try {
        await golos.broadcast.accountCreateWithDelegation(CONFIG_SEC.registrar.signing_key,
          CONFIG_SEC.registrar.fee, CONFIG_SEC.registrar.delegation,
          CONFIG_SEC.registrar.account, file_obj.username, 
            {weight_threshold: 1, account_auths: [], key_auths: [[file_obj.owner, 1]]},
            {weight_threshold: 1, account_auths: [], key_auths: [[file_obj.active, 1]]},
            {weight_threshold: 1, account_auths: [], key_auths: [[file_obj.posting, 1]]},
            file_obj.memo,
          '{}', [aro]);
        await new Promise(resolve => setTimeout(resolve, 1000));
        accs = await golos.api.getAccounts([file_obj.username]);
    } catch (err) {
        return returnError(ctx, err)
    }

    if (!accs || !accs.length) {
        return returnError(ctx, 'unknown reason');
    }

    fs.unlinkSync(path);

    ctx.body = {
        "network": {}, 
        "status": "ok"
    }
});

app.use(livereload());
app.use(cors());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(5000, () => console.log('running on port 5000'));