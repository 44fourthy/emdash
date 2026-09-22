import { Button, DropdownMenu } from '@emdash/ui/react/primitives';
import { Globe, MessageSquarePlus, Plus, SquareTerminal } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTaskViewContext } from '@core/features/tasks/contributions/browser/task-view-context';
import { getTaskComposition } from '@core/features/workbench/api/browser/task-composition-selectors';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import { BoundShortcut } from '@core/primitives/keybindings/browser/shortcut';
import { usePaneContext } from '@core/primitives/workbench-shell/browser/tabs/pane-context';

/**
 * The "+" rendered after the last tab in the tab strip (browser-tab idiom).
 * Offers the tab kinds a task can open here, each running the same command the
 * palette and its keybinding do, so availability stays in one place.
 */
export const NewConversationTabButton = observer(function NewConversationTabButton() {
  const { projectId, taskId } = useTaskViewContext();
  const { pane } = usePaneContext();
  const openCreateConversationModal = useOpenModal('createConversationModal');

  const handleCreateConversation = () => {
    void (async () => {
      const outcome = await openCreateConversationModal({ projectId, taskId });
      if (!outcome.success) return;
      const { conversationId, type } = outcome.data;
      if (type === 'acp') {
        pane.open('acp-chat', { conversationId, preview: false });
      } else {
        pane.open('conversation', { conversationId, preview: false });
      }
    })();
  };

  const handleNewTerminal = () => {
    void getTaskComposition(projectId, taskId)?.openNewTerminal();
  };

  const handleOpenBrowser = () => {
    const taskView = getTaskComposition(projectId, taskId);
    taskView?.paneLayout.open('browser', {});
    taskView?.setFocusedRegion('main');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger render={<Button size="sm" icon variant="ghost" aria-label="New tab" />}>
        <Plus className="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" sideOffset={6}>
        <DropdownMenu.Item className="gap-2 py-2" onClick={handleCreateConversation}>
          <MessageSquarePlus className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">New conversation</span>
          <BoundShortcut command="task.newConversation" variant="keycaps" />
        </DropdownMenu.Item>
        <DropdownMenu.Item className="gap-2 py-2" onClick={handleNewTerminal}>
          <SquareTerminal className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">New terminal</span>
          <BoundShortcut command="task.newTerminal" variant="keycaps" />
        </DropdownMenu.Item>
        <DropdownMenu.Item className="gap-2 py-2" onClick={handleOpenBrowser}>
          <Globe className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Open browser</span>
          <BoundShortcut command="task.openBrowser" variant="keycaps" />
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
});
