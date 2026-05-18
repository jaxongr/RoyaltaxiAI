import { Spin } from 'antd';

export default function PageLoader(): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 400,
      }}
    >
      <Spin size="large" tip="Yuklanmoqda..." />
    </div>
  );
}
