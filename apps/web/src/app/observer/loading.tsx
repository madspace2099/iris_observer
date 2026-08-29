import { LoadingScreen } from "@/observer-demo/components/states";

/**
 * Shown while a page resolves its selection on the server.
 *
 * The selection is read server-side, so changing the range or the channel is a
 * server round trip — this is the frame a person actually sees during it, not
 * a decorative state that never renders.
 */
export default function ObserverLoading() {
  return <LoadingScreen />;
}
