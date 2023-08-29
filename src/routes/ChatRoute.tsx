import {
  Box,
  Button,
  Card,
  Container,
  Flex,
  MediaQuery,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { KeyboardEvent, useState, type ChangeEvent, useEffect } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { MessageItem } from "../components/MessageItem";
import { Chat, Message, detaDB, generateKey } from "../db";
import { useChatId } from "../hooks/useChatId";
import { config } from "../utils/config";
import {
  createChatCompletion,
  createStreamChatCompletion,
} from "../utils/openai";
import { useChat, useChats, useSettings } from "../hooks/contexts";

export function ChatRoute() {
  const chatId = useChatId();

  const { settings } = useSettings()

  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // fetch data
    const dataFetch = async () => {
      const { items } = await detaDB.messages.fetch({ chatId }, { desc: false });

      setMessages(items as unknown as Message[]);
    };

    dataFetch();
  }, [chatId]);

  // const messages = useLiveQuery(() => {
  //   if (!chatId) return [];
  //   return db.messages.where("chatId").equals(chatId).sortBy("createdAt");
  // }, [chatId]);
  const userMessages =
    messages
      ?.filter((message) => message.role === "user")
      .map((message) => message.content) || [];
  const [userMsgIndex, setUserMsgIndex] = useState(0);
  const [content, setContent] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { setChats } = useChats()
  const { chat, setChat } = useChat()

  useEffect(() => {
    const dataFetch = async () => {
      const item = await detaDB.chats.get(chatId!);

      setChat(item as unknown as Chat);
    };

    if (!chat) {
      dataFetch();
    }
  }, [chatId]);

  // const chat = useLiveQuery(async () => {
  //   if (!chatId) return null;
  //   return db.chats.get(chatId);
  // }, [chatId]);

  const [writingCharacter, setWritingCharacter] = useState<string | null>(null);
  const [writingTone, setWritingTone] = useState<string | null>(null);
  const [writingStyle, setWritingStyle] = useState<string | null>(null);
  const [writingFormat, setWritingFormat] = useState<string | null>(null);

  const getSystemMessage = () => {
    const message: string[] = [];
    if (writingCharacter) message.push(`You are ${writingCharacter}.`);
    if (writingTone) message.push(`Respond in ${writingTone} tone.`);
    if (writingStyle) message.push(`Respond in ${writingStyle} style.`);
    if (writingFormat) message.push(writingFormat);
    if (message.length === 0)
      message.push(
        "You are ChatGPT, a large language model trained by OpenAI."
      );
    return message.join(" ");
  };

  const submit = async () => {
    if (submitting) return;

    if (!chatId) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "chatId is not defined. Please create a chat to get started.",
      });
      return;
    }

    if (!settings?.openAiApiKey) {
      notifications.show({
        title: "Error",
        color: "red",
        message: "OpenAI API Key is not defined. Please set your API Key",
      });
      return;
    }

    try {
      setSubmitting(true);

      const userMessage = await detaDB.messages.put({
        chatId,
        content,
        role: "user",
        createdAt: new Date().toISOString(),
      }, generateKey())

      setMessages(current => [...current, userMessage as unknown as Message])

      // await db.messages.add({
      //   id: nanoid(),
      //   chatId,
      //   content,
      //   role: "user",
      //   createdAt: new Date(),
      // });
      setContent("");

      const systemMessage = await detaDB.messages.put({
        chatId,
        content: "█",
        role: "assistant",
        createdAt: new Date().toISOString(),
      }, generateKey())

      setMessages(current => [...current, systemMessage as unknown as Message])

      const messageId = systemMessage!.key as string

      // await db.messages.add({
      //   id: messageId,
      //   chatId,
      //   content: "█",
      //   role: "assistant",
      //   createdAt: new Date(),
      // });

      await createStreamChatCompletion(
        settings.openAiApiKey,
        [
          {
            role: "system",
            content: getSystemMessage(),
          },
          ...(messages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: "user", content },
        ],
        chatId,
        messageId,
        (content) => {      
          setMessages(current => current.map(message => {
            if (message.key === messageId) {
              return { ...message, content };
            }
      
            return message;
          }));
        }
      );

      setSubmitting(false);

      if (chat?.description === "New Chat") {
        const res = await detaDB.messages.fetch({ chatId })
        const messages = res.items as unknown as Message[]
        // const messages = await db.messages
        //   .where({ chatId })
        //   .sortBy("createdAt");
        const createChatDescription = await createChatCompletion(settings.openAiApiKey, [
          {
            role: "system",
            content: getSystemMessage(),
          },
          ...(messages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user",
            content:
              "What would be a short and relevant title for this chat ? You must strictly answer with only the title, no other text is allowed. Don't use quotation marks",
          },
        ]);
        const chatDescription =
          createChatDescription.data.choices[0].message?.content;

        if (createChatDescription.data.usage) {
          const chatUpdates = {
            description: chatDescription ?? "New Chat",
            // todo: add to existing count instead of replacing
            totalTokens: createChatDescription.data.usage!.total_tokens,
          }
          await detaDB.chats.update(chatUpdates, chatId)

          setChat(chat => ({ ...chat!, ...chatUpdates }))
          setChats(current => (current || []).map(item => {
            if (item.key === chat.key) {
              return { ...item, ...chatUpdates };
            }
      
            return item;
          }));

          // await db.chats.where({ id: chatId }).modify((chat) => {
          //   chat.description = chatDescription ?? "New Chat";
          //   if (chat.totalTokens) {
          //     chat.totalTokens +=
          //       createChatDescription.data.usage!.total_tokens;
          //   } else {
          //     chat.totalTokens = createChatDescription.data.usage!.total_tokens;
          //   }
          // });
        }
      }
    } catch (error: any) {
      if (error.toJSON().message === "Network Error") {
        notifications.show({
          title: "Error",
          color: "red",
          message: "No internet connection.",
        });
      }
      const message = error.response?.data?.error?.message;
      if (message) {
        notifications.show({
          title: "Error",
          color: "red",
          message,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onUserMsgToggle = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    if (
      !["ArrowUp", "ArrowDown"].includes(event.code) ||
      selectionStart !== selectionEnd ||
      (event.code === "ArrowUp" && selectionStart !== 0) ||
      (event.code === "ArrowDown" &&
        selectionStart !== event.currentTarget.value.length)
    ) {
      // do nothing
      return;
    }
    event.preventDefault();

    const newMsgIndex = userMsgIndex + (event.code === "ArrowUp" ? 1 : -1);
    const allMessages = [contentDraft, ...Array.from(userMessages).reverse()];

    if (newMsgIndex < 0 || newMsgIndex >= allMessages.length) {
      // index out of range, do nothing
      return;
    }
    setContent(allMessages.at(newMsgIndex) || "");
    setUserMsgIndex(newMsgIndex);
  };

  const onContentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.currentTarget;
    setContent(value);
    setContentDraft(value);
    setUserMsgIndex(0);
  };

  const handleMessageDelete = (key: string) => {
    setMessages(current => current.filter(message => message.key !== key))
  }

  if (!chatId) return null;

  return (
    <>
      <Container pt="xl" pb={100}>
        <Stack spacing="xs">
          {messages?.map((message) => (
            <MessageItem key={message.key} message={message} onDeleted={handleMessageDelete} />
          ))}
        </Stack>
        {submitting && (
          <Card withBorder mt="xs">
            <Skeleton height={8} radius="xl" />
            <Skeleton height={8} mt={6} radius="xl" />
            <Skeleton height={8} mt={6} radius="xl" />
            <Skeleton height={8} mt={6} radius="xl" />
            <Skeleton height={8} mt={6} width="70%" radius="xl" />
          </Card>
        )}
      </Container>
      <Box
        py="lg"
        sx={(theme) => ({
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          [`@media (min-width: ${theme.breakpoints.md})`]: {
            left: 300,
          },
          backgroundColor:
            theme.colorScheme === "dark"
              ? theme.colors.dark[9]
              : theme.colors.gray[0],
        })}
      >
        <Container>
          {messages?.length === 0 && (
            <SimpleGrid
              mb="sm"
              spacing="xs"
              breakpoints={[
                { minWidth: "sm", cols: 4 },
                { maxWidth: "sm", cols: 2 },
              ]}
            >
              <Select
                value={writingCharacter}
                onChange={setWritingCharacter}
                data={config.writingCharacters}
                placeholder="Character"
                variant="filled"
                searchable
                clearable
                sx={{ flex: 1 }}
              />
              <Select
                value={writingTone}
                onChange={setWritingTone}
                data={config.writingTones}
                placeholder="Tone"
                variant="filled"
                searchable
                clearable
                sx={{ flex: 1 }}
              />
              <Select
                value={writingStyle}
                onChange={setWritingStyle}
                data={config.writingStyles}
                placeholder="Style"
                variant="filled"
                searchable
                clearable
                sx={{ flex: 1 }}
              />
              <Select
                value={writingFormat}
                onChange={setWritingFormat}
                data={config.writingFormats}
                placeholder="Format"
                variant="filled"
                searchable
                clearable
                sx={{ flex: 1 }}
              />
            </SimpleGrid>
          )}
          <Flex gap="sm">
            <Textarea
              key={chatId}
              sx={{ flex: 1 }}
              placeholder="Your message here..."
              autosize
              autoFocus
              disabled={submitting}
              minRows={1}
              maxRows={5}
              value={content}
              onChange={onContentChange}
              onKeyDown={async (event) => {
                if (event.code === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                  setUserMsgIndex(0);
                }
                if (event.code === "ArrowUp") {
                  onUserMsgToggle(event);
                }
                if (event.code === "ArrowDown") {
                  onUserMsgToggle(event);
                }
              }}
            />
            <MediaQuery largerThan="sm" styles={{ display: "none" }}>
              <Button
                h="auto"
                onClick={() => {
                  submit();
                }}
              >
                <AiOutlineSend />
              </Button>
            </MediaQuery>
          </Flex>
        </Container>
      </Box>
    </>
  );
}
