---
subject: "Example: every formatting option"
preheader: "A reference email. Never sent: files in emails/examples are only for previews."
eyebrow: "A note from Jonathan and Ryan"
hero: /img/email/band.jpg
hero_alt: "West Coast Revival leading worship"
hero_link: https://westcoastrevival.org/about
segment: test
---
Hey friends,

This is a reference email that shows every formatting option. Copy what you need into a real campaign in `emails/campaigns/`, then preview it with `node scripts/email/preview.mjs <file>`.

Plain paragraphs read like a letter. You can use **bold**, *italics*, and [ordinary links](https://westcoastrevival.org/songs), which get click tracking added automatically.

Jonathan and Ryan

## A photo that links somewhere

[![Worship Is Warfare, live](/img/email/wiw-live.jpg)](https://westcoastrevival.org/worship-is-warfare)

Worship Is Warfare is live Tuesdays and Thursdays at 6am MST. A single button sits centered under a paragraph:

[Watch live](https://www.youtube.com/@westcoastrevival/streams){button}

::: verse
Oh sing to the Lord a new song; sing to the Lord, all the earth!

**Psalm 96:1**
:::

::: note
## A note section

A dark panel for a second message, like a pep talk or a story behind a song. It can hold headings, paragraphs, [links](https://westcoastrevival.org/about) and buttons.

[Read our story](https://westcoastrevival.org/about){button}
:::

## Small and medium images

![Jonathan and Ryan](/img/email/brothers.jpg "medium")

Use `"small"` for something like a handwritten signature, `"medium"` for a portrait, or leave it off for a full-width photo.

---

## A grid of buttons

Put two or more button lines together and they become a two-column grid. An odd last button is centered on its own row.

[Free chord charts](https://westcoastrevival.org/songs){button}
[Worship Is Warfare](https://westcoastrevival.org/worship-is-warfare){button}
[Invite us](https://westcoastrevival.org/invite){button}
[Give](https://westcoastrevival.org/give){button}

- Lists work too
- Keep them short
