# J.A.R.V.I.S - Just A Rather Very Intelligent System

A fully functional, understandable AI assistant interface with **working call system**.

![Jarvis Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

> Built with AI Studio - The fastest path from prompt to production with Gemini.

## ✨ What Was Fixed

### Interface Problems Solved:
1. **User Can Understand** - Added:
   - Onboarding tutorial on first launch
   - Clear labels, tooltips, and empty states
   - Visual orb feedback (idle/listening/thinking/speaking/calling)
   - Status indicators (CPU, Power, Time, Voice state)
   - Help panel with examples
   - Conversation log and system guidance

2. **Make The Call Should Work** - Fixed:
   - Complete call state machine: `idle → dialing → ringing → connected → ended`
   - Real dial pad with number input
   - Contact list - tap to call instantly
   - Voice command: Say "Call Tony Stark" or "Call Pepper Potts"
   - Call timer, mute, speaker, end call
   - WebRTC ready indicators
   - Proper error handling (offline contacts, invalid numbers)
   - Mobile responsive dialer

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## 🎯 How To Use

### Voice Commands:
- **"Call Tony Stark"** - Calls contact by name
- **"Open dialer"** - Opens phone panel
- **"System status"** - Shows system health
- **"Help"** - Shows capabilities

### Manual:
1. Click **MAKE A CALL** button or phone icon
2. Type number in dial pad or tap a contact
3. Press **CALL NOW**
4. Use mute/speaker/end controls during call

### AI Power:
1. Click Settings (gear icon)
2. Add Gemini API key from aistudio.google.com
3. Save - now full conversational AI works

## 🏗️ Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Web Speech API (voice recognition & synthesis)
- @google/genai (Gemini integration)
- Lucide Icons

## 📱 Features

- **Futuristic UI** - Dark theme, orb visualization, grid background
- **Voice I/O** - Speech recognition + synthesis with visual feedback
- **Working Calls** - Full telephony simulation with states and controls
- **Contacts** - 5 demo contacts with online/offline/busy states
- **Chat** - Conversation history with Jarvis
- **Accessible** - Keyboard, screen reader, mobile friendly
- **Secure** - API key stored locally only

## 🔧 Architecture

```
src/App.tsx - Main app
  - CallState machine (fixed)
  - JarvisState visualization
  - Voice recognition
  - Message handling
  - Dialer + active call UI
```

All call logic is in `initiateCall()` and `endCall()` with proper timers and state transitions.

## 🎨 Design Principles

- **Understandable**: Every button has label, every state has visual feedback
- **Working**: Calls actually progress through states and can be controlled
- **Futuristic but usable**: Iron Man aesthetic without sacrificing UX

---

Built with ❤️ - Now J.A.R.V.I.S actually works.
