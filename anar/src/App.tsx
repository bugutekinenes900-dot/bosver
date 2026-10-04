import clsx from "clsx";
import { UiProvider, useUi } from "./state/UiContext";
import { ChatProvider } from "./state/ChatContext";
import { Sidebar } from "./components/layout/Sidebar";
import { Overlay } from "./components/layout/Overlay";
import { Header } from "./components/layout/Header";
import { ChatStream } from "./components/chat/ChatStream";
import { PromptBar } from "./components/chat/PromptBar";
import { Modals } from "./components/modals/Modals";

function Shell() {
  const { sidebarCollapsed } = useUi();

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md">
      <Sidebar />
      <Overlay />

      <div
        className={clsx(
          "transition-[padding] duration-300 ease-out",
          sidebarCollapsed ? "md:pl-[88px]" : "md:pl-72"
        )}
      >
        <Header />
        <main className="relative pt-16 bg-surface min-h-[100dvh]">
          <div className="flex flex-col w-full h-[calc(100dvh-4rem)] justify-between max-w-5xl mx-auto px-gutter py-space-md">
            <ChatStream />
            <PromptBar />
          </div>
        </main>
      </div>

      <Modals />
    </div>
  );
}

export default function App() {
  return (
    <UiProvider>
      <ChatProvider>
        <Shell />
      </ChatProvider>
    </UiProvider>
  );
}
