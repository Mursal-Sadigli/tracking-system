import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./Dashboard', () => () => <div>Dashboard Mock</div>);

test('renders the tracking system header', () => {
  window.history.pushState({}, '', '/?test=true');

  render(<App />);

  expect(screen.getByText(/Real-Time Tracking System MVP/i)).toBeInTheDocument();
});
