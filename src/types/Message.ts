export interface CodeContent {
  language: string;
  code: string;
  filePath?: string; // If content is a file, specify path
}

export interface FileChangeContent {
  filePath: string;
  diff: string; // Or directly the new file content
}

export interface ToolOutputContent {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
  command?: string;
  durationMs?: number;
}

export interface Message {
  id: string;             // Unique message ID
  topicId: string;        // Topic ID the message belongs to
  author: {
    id: string;           // Author ID (Agent ID or Human User ID)
    name: string;         // Author name (e.g., "Alex", "You")
    role: string;         // Author role (e.g., "Team Lead", "Frontend Developer", "Human")
    type: 'agent' | 'human'; // Author type
  };
  timestamp: number;      // Message timestamp
  type: 'text' | 'code' | 'file_change' | 'tool_output' | 'status_update' | 'system'; // Message type
  content: string | CodeContent | FileChangeContent | ToolOutputContent; // Message content, can be polymorphic
  mentions?: string[];    // List of @mentioned Agent or Human IDs
  parentId?: string;      // If a reply, points to parent message ID (for threading)
  metadata?: Record<string, any>; // Additional metadata, e.g., code language, file path
}
