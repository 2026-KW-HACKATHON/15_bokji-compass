import React, { createContext, useContext, useState } from "react";
export type ChatPolicy = {
  id: string;
  title: string;
  revisionId: string | null;
};
type Panel = "chat" | "menu" | null;
const Assistant = createContext({
  enabled: true,
  panel: null as Panel,
  confirm: false,
  disabledNotice: false,
  policy: null as ChatPolicy | null,
  openChat: (_policy?: ChatPolicy) => {},
  openMenu: () => {},
  closePanel: () => {},
  requestDisable: () => {},
  cancelDisable: () => {},
  disable: () => {},
  dismissNotice: () => {},
  choosePolicy: (_policy: ChatPolicy | null) => {},
});
export function AssistantProvider({ children }: React.PropsWithChildren) {
  const [enabled, setEnabled] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirm, setConfirm] = useState(false);
  const [disabledNotice, setDisabledNotice] = useState(false);
  const [policy, choosePolicy] = useState<ChatPolicy | null>(null);
  return (
    <Assistant.Provider
      value={{
        enabled,
        panel,
        confirm,
        disabledNotice,
        policy,
        openChat: (next) => {
          if (next) choosePolicy(next);
          setEnabled(true);
          setPanel("chat");
          setConfirm(false);
          setDisabledNotice(false);
        },
        openMenu: () => {
          setPanel("menu");
          setConfirm(false);
          setDisabledNotice(false);
        },
        closePanel: () => setPanel(null),
        requestDisable: () => setConfirm(true),
        cancelDisable: () => setConfirm(false),
        disable: () => {
          setEnabled(false);
          setPanel(null);
          setConfirm(false);
          setDisabledNotice(true);
          choosePolicy(null);
        },
        dismissNotice: () => setDisabledNotice(false),
        choosePolicy,
      }}
    >
      {children}
    </Assistant.Provider>
  );
}
export function useAssistant() {
  return useContext(Assistant);
}
