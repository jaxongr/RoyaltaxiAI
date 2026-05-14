import { Card, Form, Input, Button, App, Typography } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import styled from 'styled-components';

const Background = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  padding: 24px;
`;

const Wrapper = styled.div`
  width: 100%;
  max-width: 420px;
`;

const Brand = styled.div`
  text-align: center;
  margin-bottom: 24px;

  .logo {
    font-size: 56px;
    margin-bottom: 8px;
  }
  .title {
    font-size: 28px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
  }
  .subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }
`;

const Footer = styled.div`
  text-align: center;
  margin-top: 16px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
`;

export default function LoginPage(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const nav = useNavigate();
  const loc = useLocation();

  const onFinish = async (values: { username: string; password: string }): Promise<void> => {
    setLoading(true);
    try {
      const r = await api.post('/login', values);
      if (r.data.ok) {
        localStorage.setItem('auth_token', r.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${r.data.token}`;
        message.success('Xush kelibsiz!');
        const from = (loc.state as { from?: string })?.from ?? '/';
        nav(from, { replace: true });
      } else {
        message.error(r.data.error ?? 'Login xato');
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      message.error(err.response?.data?.error ?? err.message ?? 'Tarmoq xato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Background>
      <Wrapper>
        <Brand>
          <div className="logo">🚖</div>
          <div className="title">Royaltaxi AI</div>
          <div className="subtitle">Firibgarlik aniqlash tizimi</div>
        </Brand>

        <Card style={{ borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>
            Tizimga kirish
          </Typography.Title>

          <Form
            name="login"
            size="large"
            layout="vertical"
            onFinish={onFinish}
            requiredMark={false}
            autoComplete="off"
          >
            <Form.Item
              name="username"
              label="Foydalanuvchi"
              rules={[{ required: true, message: 'Loginni kiriting' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#9aa0aa' }} />}
                placeholder="admin"
                autoFocus
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Parol"
              rules={[{ required: true, message: 'Parolni kiriting' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#9aa0aa' }} />}
                placeholder="••••••••"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                icon={<SafetyOutlined />}
                style={{ height: 44, fontSize: 15, fontWeight: 600 }}
              >
                Tizimga kirish
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Footer>© 2026 Royaltaxi AI Dispatcher · Premium fraud detection</Footer>
      </Wrapper>
    </Background>
  );
}
