// Presentational chat log. `mineIsCoach` flips which side is "mine": the coach
// inbox shows the coach's messages as mine; the visitor's page shows theirs.
type Msg = { id: string; fromCoach: boolean; body: string; createdAt: Date | string };

function messageBody(body: string) {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">View class</a>
    ) : (
      part
    ),
  );
}

export function ChatMessages({ messages, mineIsCoach }: { messages: Msg[]; mineIsCoach: boolean }) {
  return (
    <div className="chat">
      {messages.map((m) => {
        const mine = mineIsCoach ? m.fromCoach : !m.fromCoach;
        return (
          <div key={m.id} className={`chatmsg ${mine ? "mine" : "theirs"}`}>
            <div className="chatbubble">{messageBody(m.body)}</div>
          </div>
        );
      })}
    </div>
  );
}
