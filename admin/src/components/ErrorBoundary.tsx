import React from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface State { hasError: boolean; error?: Error; }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('UI xato:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Result
          status="500"
          title="Sahifani ko'rsatishda xato"
          subTitle={this.state.error?.message ?? "Noma'lum xato"}
          extra={
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={() => window.location.reload()}
            >
              Sahifani qayta yuklash
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
