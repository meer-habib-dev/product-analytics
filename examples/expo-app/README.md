# Example: Expo app integration

A minimal expo-router app wired to the analytics SDK. It is intentionally not
part of the pnpm workspace (so the monorepo doesn't install React Native).

```bash
npx create-expo-app my-app && cd my-app
npx expo install @analytics/react-native react-native-mmkv react-native-nitro-modules expo-application expo-device
cp .env.example .env   # fill in your key + host
npx expo run:ios        # MMKV needs a development build, not Expo Go
```

Copy `app/_layout.tsx` and `app/index.tsx` from this folder.
