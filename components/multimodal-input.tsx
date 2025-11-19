"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { SelectItem } from "@/components/ui/select";
import { chatModels } from "@/lib/ai/models";
import { myProvider } from "@/lib/ai/providers";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { Context } from "./elements/context";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CpuIcon,
  PaperclipIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  usage,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  usage?: AppUsage;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const submitForm = useCallback(() => {
    if (isSubmitting) {
      console.log("⏸️ Already submitting, skipping");
      return;
    }
    
    setIsSubmitting(true);

    window.history.replaceState({}, "", `/chat/${chatId}`);

    // ✅ Properly typed message parts
    const messageParts: Array<{
      type: "file" | "text";
      url?: string;
      name?: string;
      mediaType?: string;
      text?: string;
    }> = [
      ...attachments.map((attachment) => ({
        type: "file" as const,
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      })),
      {
        type: "text" as const,
        text: input,
      },
    ];

    console.log("📤 Sending message parts:", JSON.stringify(messageParts, null, 2));

    // ✅ Cast to any to avoid type conflicts
    (sendMessage as any)({
      role: "user",
      parts: messageParts,
    });

    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");

    setTimeout(() => {
      setIsSubmitting(false);
      console.log("✅ isSubmitting reset to false");
    }, 500);

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input,
    isSubmitting,
    setInput,
    attachments,
    sendMessage,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []); 

  const analyzeImage = useCallback(async (imageUrl: string, imageName: string) => {
    try {
      toast.info("Analyzing image...", { duration: 2000 });
      
      const response = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          prompt: "Analyze this financial chart, document, or image. Extract key insights, data points, trends, and provide actionable information.",
        }),
      });

      if (response.ok) {
        const { analysis } = await response.json();
        
        // Add analysis to input
        setInput((prev) => {
          const prefix = prev ? prev + "\n\n" : "";
          return prefix + `📊 Analysis of ${imageName}:\n${analysis}`;
        });
        
        toast.success("Image analyzed! Check the input above.", { duration: 3000 });
      } else {
        toast.error("Failed to analyze image");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze image");
    }
  }, [setInput]);  

  const _modelResolver = useMemo(() => {
    return myProvider.languageModel(selectedModelId);
  }, [selectedModelId]);

  const contextProps = useMemo(
    () => ({
      usage,
    }),
    [usage]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  return (
  <div className={cn("relative flex w-full flex-col gap-4", className)}>
    {messages.length === 0 &&
      attachments.length === 0 &&
      uploadQueue.length === 0 && (
        <SuggestedActions
          chatId={chatId}
          sendMessage={sendMessage}
          selectedVisibilityType={selectedVisibilityType}
          messages={messages as unknown as ChatMessage[]}
        />
      )}

    <input
      className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
      multiple
      onChange={handleFileChange}
      ref={fileInputRef}
      tabIndex={-1}
      type="file"
    />

    <PromptInput
      className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
      onSubmit={(event) => {
        event.preventDefault();
        if (status !== "ready") {
          toast.error("Please wait for the model to finish its response!");
        } else {
          submitForm();
        }
      }}
    >
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          className="flex flex-row items-end gap-2 overflow-x-scroll"
          data-testid="attachments-preview"
        >
          {/* FIXED: Wrap each attachment in a div with group class */}
          {attachments.map((attachment) => (
            <div key={attachment.url} className="relative group">
              <PreviewAttachment
                attachment={attachment}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />

              {/* Analyze button - only for images */}
              {attachment.contentType?.startsWith("image/") && (
                <button
                  onClick={() => analyzeImage(attachment.url, attachment.name)}
                  className="absolute -top-2 -right-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
                  title="Analyze this image"
                  type="button"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-3 h-3"
                  >
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path
                      fillRule="evenodd"
                      d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {/* Upload queue items */}
          {uploadQueue.map((filename) => (
            <PreviewAttachment
              attachment={{
                url: "",
                name: filename,
                contentType: "",
              }}
              isUploading={true}
              key={filename}
            />
          ))}
        </div>
      )}

      <div className="flex flex-row items-start gap-1 sm:gap-2">
        <PromptInputTextarea
          autoFocus
          className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
          data-testid="multimodal-input"
          disableAutoResize={true}
          maxHeight={200}
          minHeight={44}
          onChange={handleInput}
          placeholder="Send a message..."
          ref={textareaRef}
          rows={1}
          value={input}
        />{" "}
        <Context {...contextProps} />
      </div>

      <PromptInputToolbar className="!border-top-0 border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
        <PromptInputTools className="gap-0 sm:gap-0.5">
          <AttachmentsButton
            fileInputRef={fileInputRef}
            selectedModelId={selectedModelId}
            status={status}
          />
          <ModelSelectorCompact
            onModelChange={onModelChange}
            selectedModelId={selectedModelId}
          />
        </PromptInputTools>

        {status === "submitted" ? (
          <StopButton setMessages={setMessages} stop={stop} />
        ) : (
          <PromptInputSubmit
            className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
            disabled={!input.trim() || uploadQueue.length > 0}
            status={status}
          >
            <ArrowUpIcon size={14} />
          </PromptInputSubmit>
        )}
      </PromptInputToolbar>
    </PromptInput>
  </div>
);
}


export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }
    if (prevProps.messages.length !== nextProps.messages.length) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel = selectedModelId === "chat-model-reasoning";

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const selectedModel = chatModels.find(
    (model) => model.id === optimisticModelId
  );

  return (
    <PromptInputModelSelect
      onValueChange={(modelName) => {
        const model = chatModels.find((m) => m.name === modelName);
        if (model) {
          setOptimisticModelId(model.id);
          onModelChange?.(model.id);
          startTransition(() => {
            saveChatModelAsCookie(model.id);
          });
        }
      }}
      value={selectedModel?.name}
    >
      <Trigger
        className="flex h-8 items-center gap-2 rounded-lg border-0 bg-background px-2 text-foreground shadow-none transition-colors hover:bg-accent focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        type="button"
      >
        <CpuIcon size={16} />
        <span className="hidden font-medium text-xs sm:block">
          {selectedModel?.name}
        </span>
        <ChevronDownIcon size={16} />
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[260px] p-0">
        <div className="flex flex-col gap-px">
          {chatModels.map((model) => (
            <SelectItem key={model.id} value={model.name}>
              <div className="truncate font-medium text-xs">{model.name}</div>
              <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
                {model.description}
              </div>
            </SelectItem>
          ))}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
