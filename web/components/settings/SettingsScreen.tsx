'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import {
  SegmentedControl,
  SettingRow,
  SettingsGroup,
  Slider,
  Toggle,
} from '@/components/ui/Controls';
import { useTranslation } from '@/hooks/useTranslation';
import { AVAILABLE_LOCALES, type Locale } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/uiStore';

/**
 * Device settings (§37).
 *
 * Everything here is stored on this device and applies to this device. None of
 * it is sent to the server, and none of it can affect a match: turning off
 * player names changes what this client draws, not what the server broadcasts.
 *
 * Written against `useTranslation`, which is the one screen where the i18n
 * scaffolding is actually exercised end to end. The rest of the app still holds
 * English literals - see lib/i18n.ts on why that extraction is a separate pass.
 */
export function SettingsScreen() {
  const { t } = useTranslation();

  const audio = useSettingsStore((s) => s.audio);
  const gameplay = useSettingsStore((s) => s.gameplay);
  const controls = useSettingsStore((s) => s.controls);
  const locale = useSettingsStore((s) => s.locale);

  const setAudio = useSettingsStore((s) => s.setAudio);
  const setGameplay = useSettingsStore((s) => s.setGameplay);
  const setControls = useSettingsStore((s) => s.setControls);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const reset = useSettingsStore((s) => s.reset);

  const [confirmingReset, setConfirmingReset] = useState(false);

  const percent = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader title={t('settings.title')} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-4">
        <SettingsGroup title={t('settings.audio')}>
          <SettingRow
            label={t('settings.audio.master')}
            htmlFor="audio-master"
            value={percent(audio.master)}
            control={
              <Slider
                id="audio-master"
                label={t('settings.audio.master')}
                value={audio.master}
                onChange={(master) => setAudio({ master })}
              />
            }
          />
          {/* The three channels are shown as multiplied by master, so a muted
              master reads as silent everywhere rather than leaving three
              sliders claiming to be at 80%. */}
          <SettingRow
            label={t('settings.audio.music')}
            htmlFor="audio-music"
            value={percent(audio.music * audio.master)}
            control={
              <Slider
                id="audio-music"
                label={t('settings.audio.music')}
                value={audio.music}
                onChange={(music) => setAudio({ music })}
              />
            }
          />
          <SettingRow
            label={t('settings.audio.sfx')}
            htmlFor="audio-sfx"
            value={percent(audio.sfx * audio.master)}
            control={
              <Slider
                id="audio-sfx"
                label={t('settings.audio.sfx')}
                value={audio.sfx}
                onChange={(sfx) => setAudio({ sfx })}
              />
            }
          />
          <SettingRow
            label={t('settings.audio.voice')}
            description="Applies when voice chat is enabled in a match."
            htmlFor="audio-voice"
            value={percent(audio.voice * audio.master)}
            control={
              <Slider
                id="audio-voice"
                label={t('settings.audio.voice')}
                value={audio.voice}
                onChange={(voice) => setAudio({ voice })}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.gameplay')}>
          <SettingRow
            label={t('settings.gameplay.vibration')}
            description="Haptic feedback on supported devices."
            control={
              <Toggle
                id="gameplay-vibration"
                label={t('settings.gameplay.vibration')}
                checked={gameplay.vibration}
                onChange={(vibration) => setGameplay({ vibration })}
              />
            }
          />
          <SettingRow
            label={t('settings.gameplay.names')}
            description="Show names above players on the map."
            control={
              <Toggle
                id="gameplay-names"
                label={t('settings.gameplay.names')}
                checked={gameplay.showPlayerNames}
                onChange={(showPlayerNames) => setGameplay({ showPlayerNames })}
              />
            }
          />
          <SettingRow
            label={t('settings.gameplay.effects')}
            description="Lighting and particle effects. Turn off to save battery."
            control={
              <Toggle
                id="gameplay-effects"
                label={t('settings.gameplay.effects')}
                checked={gameplay.visualEffects}
                onChange={(visualEffects) => setGameplay({ visualEffects })}
              />
            }
          />
          <SettingRow
            label={t('settings.gameplay.reduceMotion')}
            description="Your device setting is already respected. This forces it on."
            control={
              <Toggle
                id="gameplay-reduce-motion"
                label={t('settings.gameplay.reduceMotion')}
                checked={gameplay.reduceMotion}
                onChange={(reduceMotion) => setGameplay({ reduceMotion })}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.controls')}>
          <SettingRow
            label={t('settings.controls.sensitivity')}
            description="How far the stick travels for a given thumb movement."
            htmlFor="controls-sensitivity"
            value={`${controls.joystickSensitivity.toFixed(1)}x`}
            control={
              <Slider
                id="controls-sensitivity"
                label={t('settings.controls.sensitivity')}
                value={controls.joystickSensitivity}
                min={0.5}
                max={2}
                step={0.1}
                onChange={(joystickSensitivity) => setControls({ joystickSensitivity })}
              />
            }
          />
          <SettingRow
            label={t('settings.controls.position')}
            description="Which side of the screen holds the joystick."
            control={
              <SegmentedControl
                legend={t('settings.controls.position')}
                value={controls.joystickPosition}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
                onChange={(joystickPosition) => setControls({ joystickPosition })}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t('settings.language')}>
          <SettingRow
            label={t('settings.language')}
            description={
              AVAILABLE_LOCALES.length === 1
                ? 'More languages are on the way. The interface is built to take them.'
                : undefined
            }
            control={
              <SegmentedControl
                legend={t('settings.language')}
                value={locale}
                options={AVAILABLE_LOCALES.map((entry) => ({
                  value: entry.code as Locale,
                  label: entry.nativeLabel,
                }))}
                onChange={setLocale}
              />
            }
          />
        </SettingsGroup>

        <section className="pb-4">
          {confirmingReset ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-alert/30 bg-alert-glow p-4">
              <p className="text-sm text-ink">
                Reset every setting on this device to its default?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setConfirmingReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    reset();
                    setConfirmingReset(false);
                    toast.success('Settings reset.');
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => setConfirmingReset(true)}
            >
              {t('settings.reset')}
            </Button>
          )}
        </section>
      </div>
    </main>
  );
}
