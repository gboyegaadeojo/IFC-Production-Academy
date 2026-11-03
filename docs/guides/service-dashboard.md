# The Service Dashboard: a guide for new people

**Status:** being built in stages. This guide describes what was approved on 2026-11-02, and it gets updated every time the dashboard changes.

**Working today:** the Service Dashboard page, the top bar link, one shared layout, editors, the layout editor, the app name and logo setting, and the tiles that come from Planning Center and the Academy: Run of service, Current item, Service timer, Who's serving, Checklist, Producer notes, and SOP shortcuts. The wall TV screen also works, and so does YouTube live once its setup is done (see the setup guide). To set up the connections, see the [Service Dashboard setup guide](../runbooks/service-dashboard.md). Slides, ProPresenter timers, Mixer levels, and Encoder health are built and show "Not connected yet" until the church bridge is set up. Items that have to be proven on real gear are listed at the end.

## What it is

The Service Dashboard is one screen that shows the whole service while it runs: where we are in the plan, what's on the slides, and how the stream is doing.

You don't have to ask around or open six different apps. If you're serving, you can look up and see what's happening.

**It only watches. It never controls anything.** Nothing you do on the dashboard can change a slide, move a fader, or stop the stream. You still run those from ProPresenter, the mixer, and the encoder, as you always have. If the dashboard stops working, the service carries on untouched.

## Where to find it

- **On a computer:** sign in to the Academy and choose **Service Dashboard** in the top bar.
- **On the wall TV:** it's already there. The TV runs it by itself.
- **On a phone or in the installed app:** it isn't available. A phone browser shows a message asking you to open it on a computer. Your training, schedule, checklist, and SOPs all still work on your phone.

Who can open it follows Planning Center teams, the same way the Checklist does. If you're on a linked team, you have it. You don't need to finish any training first.

## One layout for everyone

Service Producer, Audio, Graphics, Camera Director, and the wall TV all see the same screen. That means when someone says "look at the run of service," everyone is looking at the same thing.

## What each tile tells you

| Tile                | What it shows                                                        | Where it comes from              |
| ------------------- | -------------------------------------------------------------------- | -------------------------------- |
| YouTube live        | **Live** or **Not live**                                             | YouTube                          |
| Stream preview      | The YouTube live stream, a little behind the room. Off by default; an editor can add it | YouTube                          |
| Current item        | What we're on, how long is left, and what's next                     | The plan and ProPresenter        |
| Run of service      | Every item with its time, and the current one marked NOW             | Planning Center                  |
| Slides              | The slide on screen and the next three                               | ProPresenter                     |
| Service timer       | Time left in the whole service, and when it should end               | Worked out from the plan         |
| ProPresenter timers | The timers running in ProPresenter                                   | ProPresenter                     |
| Encoder health      | Whether the Magewell has a good input and is streaming                | Magewell Ultra Encode AIO        |
| Who's serving       | Everyone on the team today, by position                              | Planning Center                  |
| Checklist           | Today's tasks. Ticking one here is the same as ticking it in the app | The Academy Checklist            |
| Producer notes      | Shared notes for this service                                        | Typed by the team                |
| Mixer levels        | Signal levels for the channels the editors chose                     | The mixer                        |
| SOP shortcuts       | Quick links to the procedures you need most                          | The Academy SOP library          |
| Room loudness (SPL) | Switched off for now. See below                                      | A measurement mic, when we add it |

Editors choose which tiles are on the layout, so you may not see all of these.

### A few things that are easy to misread

- **Current item goes by the plan's clock.** It works out where the service should be from the times in Planning Center, not what is really on screen. The Slides tile shows what is really on screen.
- **The plan updates every 15 minutes,** so a late change in Planning Center can take that long to appear. The next two weeks of plans are read.

- **The Slides tile may show words instead of pictures** if ProPresenter doesn't send a picture of a slide.
- **Mixer levels are not room loudness.** They show the signal on each channel. The mixer can't measure how loud the room is. That takes a measurement mic or SMAART, which we don't have yet, so the Room loudness tile is built and left switched off.
- **The stream preview runs behind the room.** That's normal for a livestream. Don't use it to judge timing.
- **"Trained" and "Still learning" are information, not permission.** They show beside each name so you know who may need a hand. Team managers decide who serves.

## What the messages mean

| You see                     | What it means                                                                | What to do                                                       |
| --------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Offline, last seen 10:12** | The tile lost its connection to the church gear. It shows the last reading   | Check that the bridge computer is on. The service isn't affected |
| **Ready, switched off**     | The tile is built, but the gear it needs isn't connected                     | Nothing                                                          |

## Changing the layout

Up to three people can edit the layout. Everyone else can view it but can't change it.

If you're an editor, choose **Edit layout**. Then:

- **Add a tile:** drag it in from the list.
- **Move a tile:** drag it by its dots.
- **Resize a tile:** drag its bottom-right corner.
- **Remove a tile:** choose **Remove**.
- **On a keyboard:** focus a tile, use the arrow keys to move it, Shift and the arrow keys to resize it, and Delete to remove it.

Choose **Save layout** when you're done. Every computer and the wall TV pick up the change.

Remember that the wall TV has to fit everything on one screen with no scrolling. The more tiles you add, the smaller the text gets, so check the TV after a big change.

### Choosing mixer channels

On the Mixer levels tile, choose **Choose channels**, or go to **Service Dashboard setup**, then **Mixer channels**. Tick any channels, aux inputs, FX returns, mix buses, matrix outputs, or mains, use **Up** and **Down** to set the order, and choose **Save channels**. Until someone chooses, the tile shows the mains and the first eight channels. This only changes what the dashboard shows. It never touches the mixer.

## The wall TV

The TV has no computer, mouse, or keyboard, and nobody signs in on it.

Our TV is likely a Roku TV, and Roku has no proper web browser. So a small Android TV or Google TV stick plugs into the HDMI port and runs the dashboard full screen.

The TV is always in the black theme. On a computer, the dashboard follows the light and dark switch beside your name.

On the TV, checklists show totals, such as "5 of 8", and notes can be read but not edited.

**To set up a TV, one time:**

1. Plug in the stick and open the screen address, which is the Academy's address followed by `/screen`. The TV shows a 6-digit code.
2. On your phone or computer, sign in and go to **Admin**, then **Service Dashboard setup**, then **Screens**. Enter the code.
3. On the Roku TV, go to **Settings**, then **System**, **Power**, and **Power on**, and choose that HDMI input. The menu can differ by TV brand. This sends the TV back to the dashboard after a power cut.

The TV holds a view-only pass, not anyone's account. It can't tick checklists or edit notes. To disconnect a TV, choose **Remove** beside it in **Screens**, and it's signed out straight away.

## How it gets its information

**From the internet, with nothing to do each week:**

- **Planning Center** provides the plan, the times, and who's serving. The Academy only reads from Planning Center and never changes it.
- **YouTube** only needs our channel and an API key, because our stream is public. Nobody signs in. The Magewell goes live as usual, and the YouTube live tile says so. It checks from 30 minutes before the service until 30 minutes after, while a screen is open, so keep the wall TV or a booth computer on. It can take a couple of minutes to change to **Live**.

The dashboard doesn't count viewers. To see how many people are watching, check YouTube Studio or Facebook directly.

**From the church network, through the bridge:**

The cloud can't reach the mixer, ProPresenter, or the Magewell directly. So a small program called the **bridge** runs on a church computer. It reads those three and sends the readings out to the Academy about once a second. It only connects outward, so no ports are opened on the church network.

If that computer is off, the tiles that depend on it go faded and say **Offline**. Everything else keeps working.

## After the service

Choose **After the service** at the top of the dashboard. It builds itself from what was recorded: how long each item ran against the plan. Use it to see where the service ran long.

- **Actual times** come from Planning Center, and appear only when someone runs the plan with Services LIVE. Without that, an item says "Not recorded".

## App name and logo

Platform administrators can change the app's name, short name, and logo under **Admin**, then **App name and logo**.

- **New installs** get the change straight away.
- **Android** picks it up by itself, but it can take days, and the name may not change in every case.
- **iPhone** will most likely need the app removed and added again.
- **Certificates already issued** keep the name they were issued under.
- **The sign-in email and the offline page** keep the original name for now, because they are fixed files.

## Words we use

| Word          | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| Tile          | One box on the dashboard                                                      |
| Layout        | Which tiles appear and where                                                  |
| Editor        | One of up to three people allowed to change the layout                        |
| Bridge        | The small program on a church computer that reads the gear                    |
| Screen        | A TV connected by code, with a view-only pass                                 |
| Scribble strip | The small name display above each channel on the mixer                       |
| SPL           | Sound pressure level: how loud the room actually is                           |

## Still to be proven

These were approved knowing they need a real test. This guide will change once they're done.

- **ProPresenter:** the exact way to read slide status, and whether it can send pictures of the next three slides. If it only sends text, those tiles show the words.
- **X32:** the exact meter format, and reading channel names from the scribble strips.
- **Magewell:** whether its web API needs a sign-in.
- **YouTube:** how soon after going live the YouTube live tile changes, on our real channel.
- **The TV stick:** that it reopens the dashboard by itself after a power cut.
- **Services LIVE times:** that they arrive as expected, the first time someone runs a plan live.
- **Text size on the TV:** whether it can be read from where people stand.
- **If the mixer changes:** the Allen & Heath dLive has a documented connection, but its meter access is unconfirmed. We found no documented way to read meters on the Waves LV1 Classic, so that tile would likely go away.
