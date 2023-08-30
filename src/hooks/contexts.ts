import React, { useContext } from "react";
import type { Chat, Prompt, Settings } from "../db";

export const ChatContext = React.createContext<{
  chat: Chat | null,
  setChat: React.Dispatch<React.SetStateAction<Chat | null>>
}>({ chat: null, setChat: () => {} });

export function useChat() {
  return useContext(ChatContext);
}

export const ChatsContext = React.createContext<{
  chats: Chat[],
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
}>({ chats: [], setChats: () => {} });

export function useChats() {
  return useContext(ChatsContext);
}

export const PromptsContext = React.createContext<{
  prompts: Prompt[],
  setPrompts: React.Dispatch<React.SetStateAction<Prompt[]>>
}>({ prompts: [], setPrompts: () => {} });

export function usePrompts() {
  return useContext(PromptsContext);
}

export const SettingsContext = React.createContext<{
  settings: Settings | null,
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>
}>({ settings: null, setSettings: () => {} });

export function useSettings() {
  return useContext(SettingsContext);
}