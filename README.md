# Garage Pro One — Synchro automatique (iPhone + PC) — HTML/CSS/JS + Firebase

✅ Même site sur iPhone et PC, **données synchronisées automatiquement** (cloud).
Connexion: **Email / Mot de passe**.

## 1) Créer Firebase (Google)
1. Firebase Console → crée un projet
2. **Authentication** → Sign-in method → **Email/Password** (Enable)
3. **Firestore Database** → Create database

## 2) Mettre la config Firebase (OBLIGATOIRE)
Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration

Copie l'objet `firebaseConfig` et colle-le dans:
- `assets/firebase-config.js`

Exemple:
```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## 3) Règles de sécurité Firestore
Firebase Console → Firestore Database → Rules
Copie/colle le fichier `firestore.rules`.

## 4) Mettre en ligne (Firebase Hosting)
Sur PC:
```bash
npm i -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

## Utilisation
- Ouvre le site
- Onglet **Créer compte**
- Connecte-toi sur iPhone et PC avec le même email/mot de passe
➡️ mêmes clients / réparations.
