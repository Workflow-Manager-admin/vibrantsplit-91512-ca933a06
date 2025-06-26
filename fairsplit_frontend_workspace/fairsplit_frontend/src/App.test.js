import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

// PUBLIC_INTERFACE
test("renders FairSplit dashboard and allows navigation to people/expenses", () => {
  render(<App />);
  // Dashboard
  expect(screen.getByText(/FairSplit/i)).toBeInTheDocument();
  expect(screen.getByText(/Real-time Expense Sharing/i)).toBeInTheDocument();

  // Nav to people
  fireEvent.click(screen.getByLabelText("People"));
  expect(screen.getByText(/People in Group/i)).toBeInTheDocument();

  // Add person
  const input = screen.getByPlaceholderText(/Add name/i);
  fireEvent.change(input, { target: { value: "Alice" } });
  fireEvent.click(screen.getByText("Add"));
  expect(screen.getByText("Alice")).toBeInTheDocument();

  // Nav to expenses
  fireEvent.click(screen.getByLabelText("Expenses"));
  expect(screen.getByText(/All Expenses/i)).toBeInTheDocument();

  // Nav back to dashboard
  fireEvent.click(screen.getByLabelText("Dashboard"));
  expect(screen.getByText(/FairSplit/i)).toBeInTheDocument();
});
