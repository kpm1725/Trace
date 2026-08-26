/**
 * The account-deletion gate.
 *
 * The only irreversible action in the app. What matters is that it cannot be
 * triggered by a stray tap, and that the subscription warning is present — that
 * one is what stops someone being billed for an account that no longer exists.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { DeleteAccountDialog } from "@/src/components/DeleteAccountDialog";
import { apiFetch } from "@/src/api/client";

jest.mock("@/src/api/client", () => ({
  ...jest.requireActual("@/src/api/client"),
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.Mock;

beforeEach(() => jest.clearAllMocks());

it("will not delete until DELETE is typed", async () => {
  const onDeleted = jest.fn();
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={onDeleted} />);

  fireEvent.press(screen.getByTestId("delete-account-confirm-button"));
  expect(mockApiFetch).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId("delete-account-confirm-input"), "delet");
  fireEvent.press(screen.getByTestId("delete-account-confirm-button"));
  expect(mockApiFetch).not.toHaveBeenCalled();
  expect(onDeleted).not.toHaveBeenCalled();
});

it("deletes once the word matches, case-insensitively", async () => {
  const onDeleted = jest.fn();
  mockApiFetch.mockResolvedValue({ ok: true });
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={onDeleted} />);

  fireEvent.changeText(screen.getByTestId("delete-account-confirm-input"), "delete");
  fireEvent.press(screen.getByTestId("delete-account-confirm-button"));

  await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith("/auth/account", { method: "DELETE" }));
  await waitFor(() => expect(onDeleted).toHaveBeenCalled());
});

it("warns that deleting does not cancel a subscription", () => {
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={jest.fn()} />);
  expect(screen.getByText(/not cancelled by deleting your account/i)).toBeTruthy();
});

it("names what is destroyed", () => {
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={jest.fn()} />);
  expect(screen.getByText(/every saved\s+diagnosis and generated circuit/i)).toBeTruthy();
});

it("explains an expired session rather than blaming the user", async () => {
  const { ApiError } = jest.requireActual("@/src/api/client");
  mockApiFetch.mockRejectedValue(new ApiError(401, null, "API 401"));
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={jest.fn()} />);

  fireEvent.changeText(screen.getByTestId("delete-account-confirm-input"), "DELETE");
  fireEvent.press(screen.getByTestId("delete-account-confirm-button"));

  expect(await screen.findByText(/session expired/i)).toBeTruthy();
});

it("keeps the account when the delete call fails", async () => {
  const onDeleted = jest.fn();
  const { ApiError } = jest.requireActual("@/src/api/client");
  mockApiFetch.mockRejectedValue(new ApiError(503, null, "API 503"));
  render(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={onDeleted} />);

  fireEvent.changeText(screen.getByTestId("delete-account-confirm-input"), "DELETE");
  fireEvent.press(screen.getByTestId("delete-account-confirm-button"));

  expect(await screen.findByTestId("delete-account-error")).toBeTruthy();
  // Nothing was deleted, so the caller must not tear down the session.
  expect(onDeleted).not.toHaveBeenCalled();
});
