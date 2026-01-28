# Reddit Power Moderator List - CSV Export

Scans **major subreddits** and identifies **moderators who appear across multiple subreddits** ("power mods"), exporting the results to a **CSV file**.

Uses **Reddit OAuth (refresh token)** and **Node ≥ 20** (native `fetch`).

---

## Features

* OAuth via **refresh token** (no interactive login at runtime)
* Scan **explicit subreddit list** or auto-fetch from `/subreddits/popular`
* Count moderators across all scanned subreddits
* Filter moderators by **minimum appearance threshold**
* Conservative rate limiting (cron-safe)
* Outputs a **single CSV**
* Minimal dependencies (`csv-stringify` only)
* One-shot execution

---

## Output (CSV)

Each row represents a subreddit:

| Column        | Description                                              |
| ------------- | -------------------------------------------------------- |
| `subreddit`   | Subreddit name                                           |
| `subscribers` | Subscriber count                                         |
| `moderators`  | Comma-separated list of moderators meeting the threshold |
| `scraped_at`  | ISO timestamp of the run                                 |

---

## Requirements

* Node.js **20+**
* Reddit OAuth tokens
* Reddit Refresh token

---

## Install

```bash
npm install
```

---

## 1) Create a Reddit OAuth App

1. Go to [https://old.reddit.com/prefs/apps](https://old.reddit.com/prefs/apps)
2. **Create app**
3. Type: **web app**
4. Redirect URI:

   ```
   http://127.0.0.1:8910/callback
   ```
5. Save:

   * Client ID
   * Client Secret

---

## 2) Get a Refresh Token

Use helper (`./src/get_refresh_token.js`) from the `src directory`.

Example:

```bash
REDDIT_CLIENT_ID=YOUR_ID \
REDDIT_CLIENT_SECRET=YOUR_SECRET \
node src/get_refresh_token.js
```

Copy the **refresh token** from stdout.

---

## 3) Environment Variables

These can be placed in a `.env` file.

```dotenv
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_SCRAPER_REFRESH_TOKEN=...
```

The script also supports passing these via CLI flags.

---

## 4) Usage

### Scan popular subreddits (default)

```bash
node src/index.js \
  --min-threshold 10 \
  --popular-limit 100 \
  --out mods.csv
```

This:

* Fetches top **100 popular subreddits**
* Includes only moderators appearing in **≥10** of them

---

### Scan explicit subreddits

```bash
node src/index.js \
  --subreddits pics,gaming,movies,news \
  --min-threshold 2 \
  --out custom.csv
```

Threshold is applied **relative to the scanned set**.

---

### Auto-named output file

```bash
node src/index.js \
  --min-threshold 5
```

Creates:

```
RedditModList_YYYY-MM-DD_HH-mm-ss.csv
```

### Big list of large subreddits in no particular order, ignoring bots command:

```
node --env-file=.env index.js --subreddits gaming,pics,movies,IAmA,EarthPorn,LifeProTips,Art,tifu,Makeup,TwoXChromosomes,wholesomememes,oddlysatisfying,dankmemes,Whatcouldgowrong,canada,AnimalsBeingBros,AnimalsBeingJerks,BikiniBottomTwitter,relationship_advice,PewdiepieSubmissions,Outdoors,atheism,instant_regret,dadjokes,Damnthatsinteresting,AnimalsBeingDerps,WatchPeopleDieInside,trashy,Eyebleach,nextfuckinglevel,MakeupAddiction,RoastMe,ChoosingBeggars,cats,HumansBeingBros,MadeMeSmile,blackmagicfuckery,backpacking,IdiotsInCars,OutOfTheLoop,Cooking,MurderedByWords,insanepeoplefacebook,NSFW_GIF,WhitePeopleTwitter,cursedcomments,madlads,comics,camping,iamverysmart,rareinsults,MemeEconomy,PeopleFuckingDying,thathappened,holdmycosmo,comedyheaven,ProgrammerHumor,2meirl4meirl,confusing_perspective,unpopularopinion,entitledparents,tattoos,MaliciousCompliance,meirl,ShittyLifeProTips,gifsthatkeepongiving,AbandonedPorn,insaneparents,iamatotalpieceofshit,UnresolvedMysteries,iamverybadass,PoliticalHumor,fakehistoryporn,skyrim,WhatsWrongWithYourDog,woooosh,shittyaskscience,thisismylifenow,StartledCats,whitepeoplegifs,crappyoffbrands,Zoomies,oddlyterrifying,suspiciouslyspecific,vancouver,HydroHomies,terriblefacebookmemes,AbsoluteUnits,justneckbeardthings,AskReddit,NoStupidQuestions,BaldursGate3,facepalm,interestingasfuck,LivestreamFail,Palworld,AmItheAsshole,mildlyinfuriating,Piracy,PeterExplainsTheJoke,funny,AITAH,dating,Helldivers,worldnews,leagueoflegends,pcmasterrace,Unexpected,news,politics,wallstreetbets,todayilearned,nottheonion,memes,PublicFreakout,Wellthatsucks,explainlikeimfive,OnePiece,HolUp,BlackPeopleTwitter,buildapc,HonkaiStarRail,SipsTea,Minecraft,mildlyinteresting,nfl,BeAmazed,DIY,nba,MapPorn,Steam,Overwatch,Genshin_Impact,classicwow,soccer --ignore-usernames automoderator,modqueue-nuke,mod-mentions,bot-bouncer,comment-nuke,evasion-guard,purge-user,bot-swatter,modmail-userinfo,auto-modmail,magic_eye_bot,modmailassistant,repostsleuthbot,subscriber-count,helpfuljanitor,floodassistant,safestbot,toxicitymodbot,hive-protect,botdefense,banhammerapp,flairassistant,spotlight-app,trendingtattler,admin-tattler,duplicatedestroyer,press-app,qualityvote2,spamsentinel --min-threshold 5 --out ./output/test.csv --verbose
```

---

### Verbose logging

```bash
node src/index.js \
  --popular-limit 50 \
  --min-threshold 5 \
  --verbose
```

---

## 5) CLI Reference

```
index.js
  --client-id <id>
  --client-secret <secret>
  --refresh-token <token>

  [--subreddits a,b,c]
  [--popular-limit N]      default: 50
  [--min-threshold N]      default: 5
  [--out filename.csv]
  [--verbose]
  [--help]
```

If `--subreddits` is omitted, `/subreddits/popular` is used.

---

## 6) Notes on Behavior

* Moderator usernames are normalized to **lowercase**
* Bots (e.g. `AutoModerator`) are included unless filtered downstream
* The CSV only lists moderators who meet the **global threshold**
* Rate limiting is conservative (~1 request / second)
* Script is safe for cron use

---

## 7) Example Analysis Workflow

```bash
# Count how many subreddits each power mod controls
csvcut -c moderators mods.csv | tr ',' '\n' | sort | uniq -c | sort -nr
```

---

## License

MIT



