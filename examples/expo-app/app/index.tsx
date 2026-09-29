import { analytics } from "@analytics/react-native";
import { Button, View } from "react-native";

async function purchase(plan: string) {
  if (plan === "broken") throw new Error("Payment sheet failed to load");
}

export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 12, padding: 24 }}>
      <Button title="Track paywall_viewed" onPress={() => analytics.track("paywall_viewed", { source: "home" })} />
      <Button
        title="Select yearly plan"
        onPress={() => analytics.track("plan_selected", { plan: "yearly", price: 49.99 })}
      />
      <Button title="Log in as user_123" onPress={() => analytics.identify("user_123", { plan: "pro" })} />
      <Button title="Log out" onPress={() => analytics.reset()} />
      <Button
        title="Handled error"
        onPress={async () => {
          try {
            await purchase("broken");
          } catch (error) {
            analytics.error(error, { screen: "Home", plan: "broken" });
          }
        }}
      />
      <Button title="Flush now" onPress={() => void analytics.flush()} />
    </View>
  );
}
