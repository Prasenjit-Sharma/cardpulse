import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'
import { sliceRanges, type ContactFields, type Native } from './platform'

/** The app's own plugin (android/app/src/main/java/in/cardpulse/app/SaveContactPlugin.java). */
const SaveContact = registerPlugin<{ insert(f: ContactFields): Promise<void> }>('SaveContact')
/** The app's own plugin (WhatsAppCardPlugin.java): the user's card into a contact's WhatsApp chat. */
const WhatsAppCard = registerPlugin<{ installed(): Promise<{ apps: string[] }>; send(o: { uris: string[]; jid: string; pkg: string }): Promise<void> }>('WhatsAppCard')

/** Base64 without the data-URL prefix, as Filesystem.writeFile expects. */
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** Ends the listening in progress once its last words are in (Done on the listening panel). */
let finishListening: (() => void) | null = null

/** The app's native abilities. The only file that imports Capacitor plugins; main.tsx hands it to platform.ts. */
export const native: Native = {
  // A backup can be 100 MB of card photos: sending it over the bridge as one base64 string runs the phone out of memory,
  // so it goes in slices, the first written and the rest appended.
  writeCache: async (name, data) => {
    let uri = ''
    for (const [i, [start, end]] of sliceRanges(data.size).entries()) {
      const part = await toBase64(data.slice(start, end))
      if (i === 0) uri = (await Filesystem.writeFile({ path: name, data: part, directory: Directory.Cache })).uri
      else await Filesystem.appendFile({ path: name, data: part, directory: Directory.Cache })
    }
    return uri
  },
  share: async ({ title, text, files }) => { await Share.share({ title, text, files, dialogTitle: title }) },
  openUrl: async (url) => { await Browser.open({ url }) },
  closeBrowser: async () => { await Browser.close().catch(() => {}) },
  onAppUrl: (cb) => { void App.addListener('appUrlOpen', (e) => cb(e.url)) },
  launchUrl: async () => (await App.getLaunchUrl())?.url,
  saveContact: async (f) => { await SaveContact.insert(f) },
  waApps: async () => (await WhatsAppCard.installed()).apps,
  waSend: async (o) => { await WhatsAppCard.send(o) },
  // SystemBarsStyle.Dark means light icons (for a dark background), as in Capacitor's docs
  setStatusBar: async (icons) => { await SystemBars.setStyle({ style: icons === 'light' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }) },
  // Android's own recognizer (the Google app or Speech Services), one utterance at a time, with the words streamed as they
  // are heard. The plugin says when speech ends but not when recognition gives up, so a quiet spell also ends it.
  listen: async (lang, onPartial) => {
    if ((await SpeechRecognition.requestPermissions()).speechRecognition !== 'granted') throw new Error('the microphone is not allowed. Allow it in Settings, Apps, CardPulse, Permissions.')
    if (!(await SpeechRecognition.available()).available) throw new Error('this phone has no speech recognition. Install or update the Google app.')
    await SpeechRecognition.removeAllListeners()
    return new Promise<string>((resolve, reject) => {
      let heard = '', over = false
      let idle: ReturnType<typeof setTimeout> | undefined
      const finish = () => {
        if (over) return
        over = true; finishListening = null
        clearTimeout(idle)
        void SpeechRecognition.removeAllListeners()
        resolve(heard)
      }
      const quietFor = (ms: number) => { clearTimeout(idle); idle = setTimeout(finish, ms) }
      finishListening = () => quietFor(700)
      void SpeechRecognition.addListener('partialResults', (d) => {
        const t = d.matches?.[0]
        if (t) { heard = t; onPartial?.(t) }
        quietFor(6000)
      })
      void SpeechRecognition.addListener('listeningState', (d) => { quietFor(d.status === 'stopped' ? 900 : 8000) })
      quietFor(8000)
      SpeechRecognition.start({ language: lang, maxResults: 1, popup: false, partialResults: true }).catch((e: unknown) => {
        if (over) return
        over = true; finishListening = null
        clearTimeout(idle)
        void SpeechRecognition.removeAllListeners()
        reject(e instanceof Error ? e : new Error(String(e)))
      })
    })
  },
  stopListening: async () => { await SpeechRecognition.stop().catch(() => {}); finishListening?.() },
}
