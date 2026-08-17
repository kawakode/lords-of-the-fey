module.exports = {
    "mongoString": process.env.MONGO_STRING || "mongodb://localhost:27017",

    "port": process.env.PORT || "8080",
    "listeningIP": process.env.LISTENING_IP || "0.0.0.0",

    "sessionSecret": process.env.SESSION_SECRET || "!! <replace this with a random secret> !!",

    "origin": process.env.ORIGIN || "http://localhost:8080",

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
}
