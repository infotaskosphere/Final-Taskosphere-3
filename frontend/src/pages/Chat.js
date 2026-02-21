import React, { useState, useEffect, useRef, useCallback } from 'react';
import RoleGuard from "@/RoleGuard";
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import api from '@/lib/api';
import { toast } from 'sonner';
import {
  MessageCircle,
  Send,
  Plus,
  Users,
  Image as ImageIcon,
  Paperclip,
  Search,
  MoreVertical,
  UserPlus,
  LogOut,
  Trash2,
  X,
  Check,
  File,
  Download
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
// Brand Colors
const COLORS = {
  deepBlue: '#0D3B66',
  mediumBlue: '#1F6FB2',
  emeraldGreen: '#1FAF5A',
  lightGreen: '#5CCB5F',
};
export default function Chat() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const fetchGroups = async () => {
  try {
    const res = await api.get("/groups");
    setGroups(res.data);
  } catch (error) {
    console.error("Error fetching groups:", error);
  }
};
  useEffect(() => {
    fetchGroups();
    fetchUsers();
   
    // Poll for new messages every 3 seconds
    pollIntervalRef.current = setInterval(() => {
      if (selectedGroup) {
        fetchMessages(selectedGroup.id, true);
      }
      fetchGroups();
    }, 3000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup.id);
    }
  }, [selectedGroup?.id]);
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
 
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  const fetchUsers = async () => {
    try {
      const response = await api.get('/chat/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users');
    }
  };
  const fetchMessages = async (groupId, silent = false) => {
    try {
      const response = await api.get(`/chat/groups/${groupId}/messages`);
      setMessages(response.data);
    } catch (error) {
      if (!silent) {
        toast.error('Failed to fetch messages');
      }
    }
  };
  const handleCreateGroup = async () => {
    if (!groupName.trim() && selectedMembers.length > 1) {
      toast.error('Please enter a group name');
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error('Please select at least one member');
      return;
    }
    setLoading(true);
    try {
      const isDirectMessage = selectedMembers.length === 1;
      const name = isDirectMessage
        ? users.find(u => u.id === selectedMembers[0])?.full_name || 'Direct Message'
        : groupName;
      const response = await api.post('/chat/groups', {
        name,
        description: groupDescription,
        members: selectedMembers,
        is_direct: isDirectMessage
      });
      toast.success(isDirectMessage ? 'Chat started!' : 'Group created!');
      setCreateDialogOpen(false);
      setGroupName('');
      setGroupDescription('');
      setSelectedMembers([]);
      fetchGroups();
      setSelectedGroup(response.data);
    } catch (error) {
      toast.error('Failed to create group');
    } finally {
      setLoading(false);
    }
  };
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;
    setSendingMessage(true);
    try {
      await api.post(`/chat/groups/${selectedGroup.id}/messages`, {
        content: newMessage,
        message_type: 'text'
      });
      setNewMessage('');
      fetchMessages(selectedGroup.id);
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroup) return;
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }
    setSendingMessage(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        const isImage = file.type.startsWith('image/');
       
        await api.post(`/chat/groups/${selectedGroup.id}/messages`, {
          content: isImage ? 'Shared an image' : `Shared a file: ${file.name}`,
          message_type: isImage ? 'image' : 'file',
          file_url: base64,
          file_name: file.name,
          file_size: file.size
        });
       
        fetchMessages(selectedGroup.id);
        toast.success('File sent!');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error('Failed to upload file');
    } finally {
      setSendingMessage(false);
    }
  };
  const handleLeaveGroup = async () => {
    if (!selectedGroup) return;
   
    try {
      await api.delete(`/chat/groups/${selectedGroup.id}`);
      toast.success('Left group successfully');
      setSelectedGroup(null);
      setGroupSettingsOpen(false);
      fetchGroups();
    } catch (error) {
      toast.error('Failed to leave group');
    }
  };
  const formatMessageTime = (dateStr) => {
    const date = new Date(dateStr);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    }
    if (isYesterday(date)) {
      return `Yesterday ${format(date, 'h:mm a')}`;
    }
    return format(date, 'MMM d, h:mm a');
  };
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  const filteredGroups = groups.filter(g =>
    g.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const totalUnread = groups.reduce((sum, g) => sum + (g.unread_count || 0), 0);
  return (
    <div className="h-[calc(100vh-120px)] flex gap-4" data-testid="chat-page">
      {/* Left Sidebar - Chat List */}
      <Card className="w-80 flex flex-col border border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-outfit flex items-center gap-2" style={{ color: COLORS.deepBlue }}>
              <MessageCircle className="h-5 w-5" />
              Messages
              {totalUnread > 0 && (
                <Badge className="bg-red-500 text-white border-0 text-xs">{totalUnread}</Badge>
              )}
            </CardTitle>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="rounded-lg"
                  style={{ background: COLORS.deepBlue }}
                  data-testid="new-chat-btn"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-outfit text-xl" style={{ color: COLORS.deepBlue }}>
                    New Conversation
                  </DialogTitle>
                  <DialogDescription>
                    Start a direct message or create a group chat
                  </DialogDescription>
                </DialogHeader>
               
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Group Name (optional for direct messages)</Label>
                    <Input
                      placeholder="Enter group name..."
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      data-testid="group-name-input"
                    />
                  </div>
                 
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      placeholder="What's this group about?"
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      rows={2}
                    />
                  </div>
                 
                  <div className="space-y-2">
                    <Label>Select Members</Label>
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                          onClick={() => {
                            if (selectedMembers.includes(u.id)) {
                              setSelectedMembers(selectedMembers.filter(id => id !== u.id));
                            } else {
                              setSelectedMembers([...selectedMembers, u.id]);
                            }
                          }}
                        >
                          <Checkbox
                            checked={selectedMembers.includes(u.id)}
                            data-testid={`member-${u.id}`}
                          />
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                            style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                          >
                            {u.full_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{u.full_name}</p>
                            <RoleGuard>
                              <p className="text-xs text-slate-500">{u.role}</p>
                            </RoleGuard>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateGroup}
                    disabled={loading || selectedMembers.length === 0}
                    style={{ background: COLORS.deepBlue }}
                    className="text-white"
                    data-testid="create-group-btn"
                  >
                    {loading ? 'Creating...' : selectedMembers.length === 1 ? 'Start Chat' : 'Create Group'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
         
          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardHeader>
       
        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedGroup?.id === group.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-slate-50'
                  }`}
                  data-testid={`chat-group-${group.id}`}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold relative shrink-0"
                    style={{ background: group.is_direct
                      ? `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`
                      : `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`
                    }}
                  >
                    {group.is_direct ? group.display_name?.charAt(0) : <Users className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900 truncate">{group.display_name}</p>
                      {group.last_message && (
                        <span className="text-xs text-slate-400">
                          {formatMessageTime(group.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 truncate">
                      {group.last_message?.content || 'No messages yet'}
                    </p>
                  </div>
                  {group.unread_count > 0 && (
                    <Badge className="bg-red-500 text-white border-0 text-xs shrink-0">
                      {group.unread_count}
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>
      {/* Right Panel - Chat Messages */}
      <Card className="flex-1 flex flex-col border border-slate-200 shadow-sm overflow-hidden">
        {selectedGroup ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ background: selectedGroup.is_direct
                    ? `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)`
                    : `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)`
                  }}
                >
                  {selectedGroup.is_direct ? selectedGroup.display_name?.charAt(0) : <Users className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{selectedGroup.display_name}</h3>
                  <p className="text-xs text-slate-500">
                    {selectedGroup.is_direct ? 'Direct Message' : `${selectedGroup.members?.length || 0} members`}
                  </p>
                </div>
              </div>
             
              {!selectedGroup.is_direct && (
                <Dialog open={groupSettingsOpen} onOpenChange={setGroupSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Group Settings</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label className="text-sm text-slate-500">Group Name</Label>
                        <p className="font-medium">{selectedGroup.name}</p>
                      </div>
                      {selectedGroup.description && (
                        <div>
                          <Label className="text-sm text-slate-500">Description</Label>
                          <p className="text-sm">{selectedGroup.description}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-sm text-slate-500">Members ({selectedGroup.member_details?.length})</Label>
                        <div className="mt-2 space-y-2">
                          {selectedGroup.member_details?.map((m) => (
                            <div key={m.id} className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                                style={{ background: COLORS.emeraldGreen }}
                              >
                                {m.name?.charAt(0)}
                              </div>
                              <span className="text-sm">{m.name}</span>
                              {m.id === selectedGroup.created_by && (
                                <Badge className="text-xs bg-slate-100 text-slate-600 border-0">Creator</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={handleLeaveGroup}
                        className="w-full"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        {selectedGroup.created_by === user?.id ? 'Delete Group' : 'Leave Group'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4 bg-slate-50">
              <div className="space-y-4">
                <AnimatePresence>
                  {messages.map((msg, index) => {
                    const isOwn = msg.sender_id === user?.id;
                    const showAvatar = index === 0 || messages[index - 1]?.sender_id !== msg.sender_id;
                   
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-2 max-w-[70%] ${isOwn ? 'flex-row-reverse' : ''}`}>
                          {showAvatar && !isOwn && (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                              style={{ background: `linear-gradient(135deg, ${COLORS.emeraldGreen} 0%, ${COLORS.lightGreen} 100%)` }}
                            >
                              {msg.sender_name?.charAt(0)}
                            </div>
                          )}
                          <div className={`${showAvatar ? '' : isOwn ? 'mr-10' : 'ml-10'}`}>
                            {showAvatar && !isOwn && (
                              <p className="text-xs text-slate-500 mb-1">{msg.sender_name}</p>
                            )}
                            <div
                              className={`rounded-2xl px-4 py-2 ${
                                isOwn
                                  ? 'rounded-tr-sm text-white'
                                  : 'rounded-tl-sm bg-white border border-slate-200'
                              }`}
                              style={isOwn ? { background: `linear-gradient(135deg, ${COLORS.deepBlue} 0%, ${COLORS.mediumBlue} 100%)` } : {}}
                            >
                              {msg.message_type === 'image' && msg.file_url && (
                                <div className="mb-2">
                                  <img
                                    src={msg.file_url}
                                    alt="Shared image"
                                    className="max-w-full rounded-lg max-h-64 object-cover"
                                  />
                                </div>
                              )}
                              {msg.message_type === 'file' && msg.file_url && (
                                <a
                                  href={msg.file_url}
                                  download={msg.file_name}
                                  className={`flex items-center gap-2 p-2 rounded-lg mb-2 ${
                                    isOwn ? 'bg-white/20' : 'bg-slate-100'
                                  }`}
                                >
                                  <File className="h-5 w-5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{msg.file_name}</p>
                                    <p className="text-xs opacity-70">{formatFileSize(msg.file_size)}</p>
                                  </div>
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                              <p className={`text-sm ${msg.message_type !== 'text' && msg.file_url ? 'opacity-70' : ''}`}>
                                {msg.content}
                              </p>
                            </div>
                            <p className={`text-xs text-slate-400 mt-1 ${isOwn ? 'text-right' : ''}`}>
                              {formatMessageTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            {/* Message Input */}
            <div className="p-4 border-t border-slate-100 bg-white">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingMessage}
                  className="text-slate-500 hover:text-slate-700"
                  title="Attach file"
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    fileInputRef.current.accept = 'image/*';
                    fileInputRef.current?.click();
                  }}
                  disabled={sendingMessage}
                  className="text-slate-500 hover:text-slate-700"
                  title="Send image"
                >
                  <ImageIcon className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                  disabled={sendingMessage}
                  data-testid="message-input"
                />
                <Button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  className="rounded-full w-10 h-10 p-0"
                  style={{ background: COLORS.deepBlue }}
                  data-testid="send-message-btn"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: `${COLORS.deepBlue}15` }}
              >
                <MessageCircle className="h-10 w-10" style={{ color: COLORS.deepBlue }} />
              </div>
              <h3 className="text-xl font-semibold text-slate-700">Welcome to Chat</h3>
              <p className="text-slate-500 mt-2">Select a conversation or start a new one</p>
              <Button
                className="mt-4"
                style={{ background: COLORS.deepBlue }}
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Conversation
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
