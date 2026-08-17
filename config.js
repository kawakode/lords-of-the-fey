var PLACEHOLDER_SECRET = "!! <replace this with a random secret> !!";

var isProduction = process.env.NODE_ENV === "production";
var origin = process.env.ORIGIN || "http://localhost:8080";
var sessionSecret = process.env.SESSION_SECRET || "";

/*
   A guessable session secret lets anyone forge a session cookie and log in as
   any player, so a production process refuses to start without a real one
   (OWASP A02: cryptographic failures / A05: misconfiguration).
*/
if(!sessionSecret || sessionSecret === PLACEHOLDER_SECRET || sessionSecret.length < 32) {
    if(isProduction) {
        console.error("FATAL: SESSION_SECRET must be set to at least 32 random characters " +
                      "(generate one with: openssl rand -hex 32)");
        process.exit(1);
    }
    if(!sessionSecret) { sessionSecret = require("crypto").randomBytes(32).toString("hex"); }
    console.warn("WARNING: SESSION_SECRET is missing or too short; using a throwaway " +
                 "development secret. Sessions will not survive a restart.");
}

module.exports = {
    "mongoString": process.env.MONGO_STRING || "mongodb://localhost:27017",

    "port": process.env.PORT || "8080",
    "listeningIP": process.env.LISTENING_IP || "0.0.0.0",

    "sessionSecret": sessionSecret,

    "origin": origin,

    "isProduction": isProduction,

    /** true when the public origin is HTTPS: gates HSTS and the Secure cookie flag */
    "usesHttps": /^https:/i.test(origin),

    /** set TRUST_PROXY=1 (or a hop count) only when running behind a proxy you control */
    "trustProxy": process.env.TRUST_PROXY || false,

    "facebook": {
        "enabled": process.env.FACEBOOK_ENABLED === "true" || false,
        "app_id": process.env.FACEBOOK_APP_ID || "<use tokens from https://developers.facebook.com>",
        "app_secret": process.env.FACEBOOK_APP_SECRET || "<use tokens from https://developers.facebook.com>"
    },
    "twitter": {
        "enabled": process.env.TWITTER_ENABLED === "true" || false,
        "consumer_key": process.env.TWITTER_CONSUMER_KEY || "<use tokens from https://apps.twitter.com>",
        "consumer_secret": process.env.TWITTER_CONSUMER_SECRET || "<use tokens from https://apps.twitter.com>"
    },
    "google": {
        "enabled": process.env.GOOGLE_ENABLED === "true" || false,
        "clientID": process.env.GOOGLE_CLIENT_ID || "<use tokens from https://console.developers.google.com>",
        "clientSecret": process.env.GOOGLE_CLIENT_SECRET || "<use tokens from https://console.developers.google.com>"
    },

    "sourceLink": "https://github.com/apsillers/lords-of-the-fey"
};
