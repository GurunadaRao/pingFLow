import ChannelSidebar from "../components/channel-sidebar";
import ChatView from "../components/chat-view";
import MessageInput from "../components/message-input";

export function ChatPage() {
  return (
    <section className="h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto h-full max-w-7xl overflow-hidden border border-white/10 bg-[#0f1115]">
        <div className="flex h-full">
          <ChannelSidebar />
          <div className="flex flex-1 flex-col">
            <ChatView />
            <MessageInput />
          </div>
        </div>
      </div>
    </section>
  );
}

export default ChatPage;
