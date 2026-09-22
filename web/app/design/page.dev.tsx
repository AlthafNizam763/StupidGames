import { notFound } from 'next/navigation';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { AVATAR_IDS, DEFAULT_APPEARANCE } from '@voidline/shared';
import {
  ACCESSORY_LABELS,
  BACKPACK_LABELS,
  BODY_LABELS,
  BodyType,
  CatCharacter,
  HAIR_LABELS,
  HAIR_PAINT,
  HumanCharacter,
  OUTFIT_PAINT,
  ROSTERS,
  SHOE_PAINT,
  SKIN_PAINT,
  type CatExpression,
  type Expression,
} from '@/components/character';

/**
 * The design system gallery.
 *
 * Development only. The file is `page.dev.tsx`, which is a route only outside
 * production, so this does not exist in a production build - the `notFound()`
 * below is a second lock on the same door, not the door.
 *
 * It exists because hand-authored SVG is not reviewable as source. A path
 * either looks like a character or it does not, and the only way to find out
 * is to render every variant at once and look at them together. This page is
 * also where a regression shows up first: one broken hairstyle is obvious in
 * a row of eight and invisible in a match.
 */
export default async function DesignGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  /*
   * `?only=the-cat` renders a single section.
   *
   * A headless screenshot cannot scroll, so reviewing one row of a page this
   * long means either a 4000px image nobody can read or a way to isolate the
   * part in question. This is the way to isolate it.
   */
  const only = (await searchParams).only ?? null;

  return (
    <>
      {/*
       * Hiding the other sections with CSS rather than filtering the tree:
       * one rule, no prop threaded through a dozen call sites, and the page
       * renders identically whether or not the parameter is present.
       */}
      {only ? (
        <style>{`main section:not(#${only}) { display: none }`}</style>
      ) : null}
      {gallery()}
    </>
  );
}

function gallery() {
  return (
    <main id="main" className="station-backdrop min-h-screen-safe px-safe py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <header>
          <p className="font-mono text-xs tracking-[0.3em] text-ink-faint uppercase">
            Development only
          </p>
          <h1 className="mt-2 text-3xl font-bold text-ink">Design system</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Every token and character variant on one page. If something here looks wrong, it looks
            wrong everywhere.
          </p>
        </header>

        <Section
          title="Brand"
          note="A station from a distance, a cat the moment you notice the ears. Shown at the sizes it actually ships at."
        >
          <div className="flex flex-wrap items-end gap-8 rounded-2xl border border-void-700 bg-void-900 p-6">
            <Logo stacked showTagline />
            <Logo />
            <Logo compact />
            <div className="flex items-end gap-4">
              <LogoMark eyes className="size-16 text-signal" />
              <LogoMark className="size-8 text-signal" />
              <LogoMark className="size-4 text-signal" />
            </div>
            {/* On a light surface, to prove currentColor really is the only colour. */}
            <div className="rounded-xl bg-ink p-3">
              <LogoMark className="size-8 text-void-950" />
            </div>
          </div>
        </Section>

        <Section
          title="Colour"
          note="One accent carries emphasis. Alert means danger. Cat is private-surface only."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ['void-950', 'bg-void-950'],
              ['void-900', 'bg-void-900'],
              ['void-850', 'bg-void-850'],
              ['void-800', 'bg-void-800'],
              ['void-700', 'bg-void-700'],
              ['void-600', 'bg-void-600'],
              ['signal', 'bg-signal'],
              ['alert', 'bg-alert'],
              ['caution', 'bg-caution'],
              ['beacon', 'bg-beacon'],
              ['cat', 'bg-cat'],
              ['cat-eye', 'bg-cat-eye'],
            ].map(([name, cls]) => (
              <div key={name} className="overflow-hidden rounded-xl border border-void-700">
                <div className={`h-14 ${cls}`} />
                <p className="bg-void-900 px-2 py-1.5 font-mono text-[0.6875rem] text-ink-muted">
                  {name}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Body type" note="The same appearance on both silhouettes.">
          <Row>
            {ROSTERS.body.map((body) => (
              <Swatch key={body} label={BODY_LABELS[body]}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, body }}
                  avatarId="operator-01"
                  className="size-32"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section title="Hair" note="Eight styles. Each has to differ in outline, not in detail.">
          <Row>
            {ROSTERS.hair.map((hair) => (
              <Swatch key={hair} label={HAIR_LABELS[hair]}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, hair, hairColour: 'hairc-auburn' }}
                  avatarId="operator-03"
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section title="Hair colour">
          <Row>
            {ROSTERS.hairColour.map((hairColour) => (
              <Swatch key={hairColour} label={HAIR_PAINT[hairColour].label}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, hair: 'hair-bob', hairColour }}
                  avatarId="operator-08"
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section title="Skin tone">
          <Row>
            {ROSTERS.skin.map((skin) => (
              <Swatch key={skin} label={SKIN_PAINT[skin].label}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, skin, hair: 'hair-curls' }}
                  avatarId="operator-06"
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section
          title="Uniform"
          note="The cut is the cosmetic. The colour is the player's identity, and a cosmetic may never override it."
        >
          <Row>
            {ROSTERS.outfit.map((outfit) => (
              <Swatch key={outfit} label={OUTFIT_PAINT[outfit].label}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, outfit, body: BodyType.GIRL }}
                  avatarId="operator-05"
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section title="Shoes, accessories and packs">
          <Row>
            {ROSTERS.shoes.map((shoes) => (
              <Swatch key={shoes} label={SHOE_PAINT[shoes].label}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, shoes, backpack: null }}
                  avatarId="operator-02"
                  className="size-28"
                />
              </Swatch>
            ))}
            {ROSTERS.accessory.map((accessory) => (
              <Swatch key={accessory} label={ACCESSORY_LABELS[accessory]}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, accessory, backpack: null }}
                  avatarId="operator-04"
                  className="size-28"
                />
              </Swatch>
            ))}
            {ROSTERS.backpack.map((backpack) => (
              <Swatch key={backpack} label={BACKPACK_LABELS[backpack]}>
                <HumanCharacter
                  appearance={{ ...DEFAULT_APPEARANCE, backpack }}
                  avatarId="operator-07"
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section
          title="Uniform colours"
          note="The eight avatar presets. This is how players name each other out loud."
        >
          <Row>
            {AVATAR_IDS.map((id) => (
              <Swatch key={id} label={id.replace('operator-', '')}>
                <HumanCharacter appearance={DEFAULT_APPEARANCE} avatarId={id} className="size-24" />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section title="Expression">
          <Row>
            {(['NORMAL', 'HAPPY', 'SURPRISED', 'SCARED', 'SUSPICIOUS', 'DEAD'] as Expression[]).map(
              (expression) => (
                <Swatch key={expression} label={expression}>
                  <HumanCharacter
                    appearance={DEFAULT_APPEARANCE}
                    avatarId="operator-01"
                    expression={expression}
                    className="size-28"
                  />
                </Swatch>
              ),
            )}
          </Row>
        </Section>

        <Section title="Pose">
          <Row>
            {(['IDLE', 'WALK', 'CHEER', 'SLUMP'] as const).map((pose) => (
              <Swatch key={pose} label={pose}>
                <HumanCharacter
                  appearance={DEFAULT_APPEARANCE}
                  avatarId="operator-02"
                  pose={pose}
                  className="size-28"
                />
              </Swatch>
            ))}
          </Row>
        </Section>

        <Section
          title="The Cat"
          note="Private surfaces only. Never rendered from a broadcast payload, because no broadcast payload carries a role."
        >
          <div className="cat-backdrop rounded-2xl border border-cat/25 p-5">
            <Row>
              {(
                [
                  'NORMAL',
                  'SUSPICIOUS',
                  'SMIRK',
                  'ANGRY',
                  'SNEAKY',
                  'SHOCKED',
                  'HAPPY',
                  'DEFEATED',
                ] as CatExpression[]
              ).map((expression) => (
                <Swatch key={expression} label={expression}>
                  <CatCharacter expression={expression} className="size-28" />
                </Swatch>
              ))}
              <Swatch label="CROUCH">
                <CatCharacter expression="SNEAKY" pose="CROUCH" className="size-28" />
              </Swatch>
            </Row>
          </div>
        </Section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------- layout - */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  // An id per section, so a section can be linked to and - the reason it is
  // here - screenshotted on its own during review.
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note ? <p className="mt-1 max-w-2xl text-sm text-ink-faint">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function Swatch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-28 flex-col items-center gap-2 rounded-xl border border-void-700 bg-void-900 p-3">
      <div className="grid h-32 place-items-center">{children}</div>
      <p className="w-full truncate text-center font-mono text-[0.625rem] text-ink-faint uppercase">
        {label}
      </p>
    </div>
  );
}
